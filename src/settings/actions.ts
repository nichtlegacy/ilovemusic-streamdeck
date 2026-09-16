type BooleanSetting = boolean | "true" | "false" | undefined;

export type NowPlayingSettings = {
  showChannelName: boolean;
  showSongInfo: boolean;
};

export type NowPlayingSettingsInput = {
  showChannelName?: BooleanSetting;
  showSongInfo?: BooleanSetting;
};

export type VolumeSettings = {
  showLabel: boolean;
  bigPercent: boolean;
};

export type VolumeSettingsInput = {
  showLabel?: BooleanSetting;
  bigPercent?: BooleanSetting;
};

export type RandomSettings = {
  pool: "all" | "favorites";
};

export type RandomSettingsInput = {
  pool?: "all" | "favorites";
};

export type SelectSettings = {
  stationId?: string;
};

export type SelectSettingsInput = {
  stationId?: string;
};

export type VolumeStepSettings = {
  direction: "up" | "down";
  stepPercent: 1 | 5 | 10 | 15 | 20;
};

export type VolumeStepSettingsInput = {
  direction?: "up" | "down";
  stepPercent?: 1 | 5 | 10 | 15 | 20 | "1" | "5" | "10" | "15" | "20";
};

export function normalizeNowPlayingSettings(settings: NowPlayingSettingsInput | undefined): NowPlayingSettings {
  return {
    showChannelName: parseBooleanSetting(settings?.showChannelName, true),
    showSongInfo: parseBooleanSetting(settings?.showSongInfo, false),
  };
}

export function normalizeVolumeSettings(settings: VolumeSettingsInput | undefined): VolumeSettings {
  return {
    showLabel: parseBooleanSetting(settings?.showLabel, false),
    bigPercent: parseBooleanSetting(settings?.bigPercent, false),
  };
}

export function normalizeRandomSettings(settings: RandomSettingsInput | undefined): RandomSettings {
  return {
    pool: settings?.pool === "favorites" ? "favorites" : "all",
  };
}

export function normalizeSelectSettings(settings: SelectSettingsInput | undefined): SelectSettings {
  const stationId = settings?.stationId?.trim();
  return stationId ? { stationId } : {};
}

export function normalizeVolumeStepSettings(settings: VolumeStepSettingsInput | undefined): VolumeStepSettings {
  const direction = settings?.direction === "down" ? "down" : "up";
  const step = Number(settings?.stepPercent ?? 5);

  switch (step) {
    case 1:
    case 5:
    case 10:
    case 15:
    case 20:
      return { direction, stepPercent: step };
    default:
      return { direction, stepPercent: 5 };
  }
}

function parseBooleanSetting(value: BooleanSetting, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === true || value === "true";
}
