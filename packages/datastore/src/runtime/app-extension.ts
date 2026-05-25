import { registerAppExtension, rovy, type App, type Ctor, type ParamDescriptor, type RovyRegistry } from "@rovy/core";
import { rovyData } from "../registry";
import {
	DATASTORE_OPENER_PREFIX,
	DATASTORE_READER_PREFIX,
	DATASTORE_WRITER_PREFIX,
	openerParamId,
	readerParamId,
	writerParamId,
} from "../types";
import { DataStoreRuntime } from "./data-store-runtime";
import { DocumentOpenerHandle } from "./document-opener-handle";
import { DocumentReaderHandle } from "./document-reader-handle";
import { DocumentWriterHandle } from "./document-writer-handle";

const DATASTORE_PLUGIN_MARKER = "__rovyDatastoreInstalled";

export class DataStoreSet {}

function paramNeedsDatastore(param: ParamDescriptor): boolean {
	return (
		param.kind === "external" &&
		(param.id.find(DATASTORE_READER_PREFIX)[0] === 1 ||
			param.id.find(DATASTORE_WRITER_PREFIX)[0] === 1 ||
			param.id.find(DATASTORE_OPENER_PREFIX)[0] === 1)
	);
}

function paramsNeedDatastore(params: ReadonlyArray<ParamDescriptor>): boolean {
	return params.some(paramNeedsDatastore);
}

function registryNeedsDatastore(registry: RovyRegistry): boolean {
	if (rovyData.hasDocuments()) return true;
	for (const system of registry.systems) if (paramsNeedDatastore(system.params)) return true;
	for (const observer of registry.observers) if (paramsNeedDatastore(observer.params)) return true;
	for (const monitor of registry.monitors) if (paramsNeedDatastore(monitor.params)) return true;
	for (const prefab of registry.prefabs) if (paramsNeedDatastore(prefab.params)) return true;
	return false;
}

export function installDatastoreRuntime(app: App, registry: RovyRegistry): DataStoreRuntime | undefined {
	const marked = app as App & Record<string, unknown>;
	if (marked[DATASTORE_PLUGIN_MARKER] === true) return undefined;
	if (!registryNeedsDatastore(registry)) return undefined;
	marked[DATASTORE_PLUGIN_MARKER] = true;

	for (const doc of rovyData.documents()) {
		rovy.__event(rovyData.eventCtor("opened", doc.id), { label: `DocumentOpened<${doc.name}>` });
		rovy.__event(rovyData.eventCtor("openFailed", doc.id), { label: `DocumentOpenFailed<${doc.name}>` });
		rovy.__event(rovyData.eventCtor("changed", doc.id), { label: `DocumentChanged<${doc.name}>` });
		rovy.__event(rovyData.eventCtor("saved", doc.id), { label: `DocumentSaved<${doc.name}>` });
		rovy.__event(rovyData.eventCtor("saveFailed", doc.id), { label: `DocumentSaveFailed<${doc.name}>` });
		rovy.__event(rovyData.eventCtor("closed", doc.id), { label: `DocumentClosed<${doc.name}>` });
	}

	const runtime = new DataStoreRuntime(rovyData.documents(), app.eventRegistry);
	app.insertResource(runtime);
	for (const doc of rovyData.documents()) {
		app.insertParam(readerParamId(doc.id), new DocumentReaderHandle(runtime, doc.id));
		app.insertParam(writerParamId(doc.id), new DocumentWriterHandle(runtime, doc.id));
		app.insertParam(openerParamId(doc.id), new DocumentOpenerHandle(runtime, doc.id));
	}

	for (const schedule of registry.schedules) {
		const existing = app.scheduler.getSetOrder(schedule.ctor);
		app.configureSets(schedule.ctor, [DataStoreSet, ...existing]);
		class RovyDataStoreProcessQueues {
			run(): void {
				runtime.processQueues();
			}
		}
		rovy.__system(RovyDataStoreProcessQueues as unknown as Ctor, {
			id: `@rovy/datastore/DataStoreProcessQueues:${tostring(schedule.ctor)}`,
			schedule: schedule.ctor,
			set: DataStoreSet,
			params: [],
		});
	}

	return runtime;
}

registerAppExtension((app, registry) => {
	installDatastoreRuntime(app, registry);
});
