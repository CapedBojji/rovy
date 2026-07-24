import { App } from "@rovy/core";
import {
	ScribeNativeModule,
	ScribePlugin,
} from "@rovy/scribe";

declare const scribeModule: ScribeNativeModule;
declare const unverifiedScribeModule: ScribeNativeModule;

// #region strict-peer
const supportedApp = new App();
supportedApp.addPlugin(
	new ScribePlugin({
		module: scribeModule,
	}),
);
// #endregion strict-peer

// #region unverified-peer
const experimentalApp = new App();
experimentalApp.addPlugin(
	new ScribePlugin({
		module: unverifiedScribeModule,
		strict: false,
	}),
);
// #endregion unverified-peer
