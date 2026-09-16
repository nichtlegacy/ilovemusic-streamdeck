import streamDeck from "@elgato/streamdeck";

import { ToggleAction } from "./actions/toggle";
import { NextChannelAction } from "./actions/next";
import { RandomChannelAction } from "./actions/random";
import { SelectChannelAction } from "./actions/select-channel";
import { NowPlayingAction } from "./actions/now-playing";
import { FavoriteAction } from "./actions/favorite";
import { VolumeStepAction } from "./actions/volume-step";
import { VolumeAction } from "./actions/volume";

streamDeck.actions.registerAction(new ToggleAction());
streamDeck.actions.registerAction(new NextChannelAction());
streamDeck.actions.registerAction(new RandomChannelAction());
streamDeck.actions.registerAction(new SelectChannelAction());
streamDeck.actions.registerAction(new NowPlayingAction());
streamDeck.actions.registerAction(new FavoriteAction());
streamDeck.actions.registerAction(new VolumeStepAction());
streamDeck.actions.registerAction(new VolumeAction());

streamDeck.connect();
