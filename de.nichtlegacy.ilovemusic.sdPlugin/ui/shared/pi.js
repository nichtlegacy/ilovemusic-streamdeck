(function () {
  let socket;
  let registrationAction = "";
  let context = "";
  let currentSettings = {};
  const pluginMessageListeners = new Set();

  function getControls() {
    return Array.from(document.querySelectorAll("[data-setting]"));
  }

  function parseDefaultValue(control) {
    const fallback = control.dataset.default;
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return fallback === "true";
    }

    return fallback ?? "";
  }

  function readControlValue(control) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      return control.checked;
    }

    return control.value;
  }

  function writeControlValue(control, value) {
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      control.checked = value === true || value === "true";
      return;
    }

    control.value = typeof value === "string" ? value : String(value ?? "");
  }

  function applySettings() {
    for (const control of getControls()) {
      const setting = control.dataset.setting;
      if (!setting) continue;

      const nextValue = currentSettings[setting] ?? parseDefaultValue(control);
      writeControlValue(control, nextValue);
    }
  }

  function persistSettings() {
    const nextSettings = { ...currentSettings };
    for (const control of getControls()) {
      const setting = control.dataset.setting;
      if (!setting) continue;
      nextSettings[setting] = readControlValue(control);
    }

    currentSettings = nextSettings;
    send({
      action: registrationAction,
      context,
      event: "setSettings",
      payload: currentSettings,
    });
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function onMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      // A throw inside a WebSocket listener kills the handler for every later
      // message, which would leave the inspector frozen on one bad frame.
      return;
    }
    if (!message || typeof message !== "object") return;

    if (message.event === "didReceiveSettings") {
      currentSettings = message.payload?.settings ?? {};
      applySettings();
      return;
    }

    if (message.event === "sendToPropertyInspector") {
      for (const listener of pluginMessageListeners) {
        listener(message.payload);
      }
    }
  }

  function replaceOptions(setting, items, placeholder) {
    const select = document.querySelector(`[data-setting="${setting}"]`);
    if (!(select instanceof HTMLSelectElement)) return;

    const selectedValue = currentSettings[setting] ?? parseDefaultValue(select);
    select.innerHTML = "";

    if (placeholder) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = placeholder;
      select.appendChild(placeholderOption);
    }

    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;

      const option = document.createElement("option");
      option.value = typeof item.value === "string" ? item.value : "";
      option.textContent = typeof item.label === "string" ? item.label : option.value;
      option.disabled = item.disabled === true;
      select.appendChild(option);
    }

    // Assigning a value the select has no option for silently resolves to "",
    // and the next change anywhere on the page would then persist that empty
    // value over the user's station. Keep the stored value selectable instead,
    // marked so it is clear why it is not in the live list.
    const hasOption = Array.from(select.options).some((option) => option.value === selectedValue);
    if (selectedValue && !hasOption) {
      const missing = document.createElement("option");
      missing.value = String(selectedValue);
      missing.textContent = `${selectedValue} (unavailable)`;
      select.appendChild(missing);
    }

    writeControlValue(select, selectedValue);
  }

  function onControlChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.setting) return;
    persistSettings();
  }

  document.addEventListener("change", onControlChange);

  window.PI = {
    getSettings() {
      return { ...currentSettings };
    },
    onPluginMessage(listener) {
      pluginMessageListeners.add(listener);
      return () => pluginMessageListeners.delete(listener);
    },
    replaceOptions,
    sendToPlugin(payload) {
      send({
        action: registrationAction,
        context,
        event: "sendToPlugin",
        payload,
      });
    },
  };

  window.connectElgatoStreamDeckSocket = (port, uuid, event, info, actionInfo) => {
    const actionInfoObject = JSON.parse(actionInfo);
    registrationAction = actionInfoObject.action;
    context = actionInfoObject.context;
    currentSettings = actionInfoObject.payload?.settings ?? {};
    applySettings();

    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ event, uuid }));
      window.dispatchEvent(new CustomEvent("pi-ready", {
        detail: {
          actionInfo: actionInfoObject,
          info: JSON.parse(info),
        },
      }));
    });
  };
})();
