import { SystemSet, schedule } from "@rovy/core";

@schedule({ runOnStart: true })
export class Startup {}

@schedule
export class Render {}

export class UiStartupSet extends SystemSet {}
export class UiRenderSet extends SystemSet {}
