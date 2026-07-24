import type {
	ScribeBinding,
	ScribeLogFilter,
} from "./binding";
import type {
	ScribeDiagnostics,
} from "./services";
import type {
	ScribeLogEntry,
	ScribeMetricSummary,
	ScribeSerializable,
	ScribeStatus,
} from "./types";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";

type UnknownTable = Record<string | number, unknown>;

export class ScribeDiagnosticsRuntime
	implements ScribeDiagnostics
{
	constructor(private readonly binding: ScribeBinding) {}

	status(): ScribeStatus {
		const status = this.binding.status();
		assert(
			status === "Healthy" ||
				status === "Degraded" ||
				status === "Outage",
			`[rovy/scribe] native GetStatus returned invalid status '${tostring(status)}'`,
		);
		return status;
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeLogEntry> {
		validateLogFilter(filter);
		const entries = new Array<ScribeLogEntry>();
		for (const raw of this.binding.recentLogs(filter)) {
			entries.push(normalizeScribeLogEntry(raw));
		}
		return table.freeze(entries);
	}

	metrics(): Readonly<Record<string, number | ScribeMetricSummary>> {
		const output: Record<string, number | ScribeMetricSummary> = {};
		for (const [name, raw] of pairs(this.binding.metrics())) {
			assert(
				typeIs(name, "string") && name.size() > 0,
				"[rovy/scribe] native GetMetrics returned an invalid metric name",
			);
			if (typeIs(raw, "number")) {
				output[name] = raw;
				continue;
			}
			assert(
				typeIs(raw, "table"),
				`[rovy/scribe] native metric '${name}' is neither a number nor summary`,
			);
			const summary = raw as unknown as UnknownTable;
			const count = summary.Count ?? summary.count;
			const average = summary.Average ?? summary.average;
			const maximum = summary.Max ?? summary.max;
			assert(
				typeIs(count, "number") &&
					typeIs(average, "number") &&
					typeIs(maximum, "number"),
				`[rovy/scribe] native metric '${name}' has a malformed summary`,
			);
			output[name] = table.freeze({
				count,
				average,
				max: maximum,
			});
		}
		return table.freeze(output);
	}

	addSink(sink: (entry: ScribeLogEntry) => void): void {
		assert(
			typeIs(sink, "function"),
			"[rovy/scribe] diagnostics.addSink requires a callback",
		);
		this.binding.addLogSink((entry) => {
			sink(normalizeScribeLogEntry(entry));
		});
	}
}

export function normalizeScribeLogEntry(raw: unknown): ScribeLogEntry {
	assert(
		typeIs(raw, "table"),
		"[rovy/scribe] native diagnostics returned a non-table log entry",
	);
	const entry = raw as UnknownTable;
	const at = entry.At ?? entry.at;
	const level = entry.Level ?? entry.level;
	const category = entry.Category ?? entry.category;
	const code = entry.Code ?? entry.code;
	const message = entry.Message ?? entry.message;
	assert(
		typeIs(at, "number") &&
			isLogLevel(level) &&
			isLogCategory(category) &&
			typeIs(code, "string") &&
			typeIs(message, "string"),
		"[rovy/scribe] native diagnostics returned a malformed log entry",
	);
	const context = entry.Context ?? entry.context;
	assert(
		context === undefined || typeIs(context, "table"),
		"[rovy/scribe] native diagnostics returned malformed log context",
	);
	return table.freeze({
		at,
		level,
		category: category as ScribeLogEntry["category"],
		code,
		message,
		context:
			context === undefined
				? undefined
				: freezeScribeValue(
						cloneScribeValue(context),
					) as Readonly<Record<string, ScribeSerializable>>,
	});
}

function validateLogFilter(filter?: ScribeLogFilter): void {
	if (filter === undefined) return;
	if (filter.level !== undefined) {
		assert(
			isLogLevel(filter.level),
			"[rovy/scribe] diagnostics log level filter is invalid",
		);
	}
	if (filter.category !== undefined) {
		assert(
			isLogCategory(filter.category),
			"[rovy/scribe] diagnostics log category filter is invalid",
		);
	}
	if (filter.code !== undefined) {
		assert(
			filter.code.size() > 0,
			"[rovy/scribe] diagnostics log code filter must not be empty",
		);
	}
	if (filter.limit !== undefined) {
		assert(
			filter.limit >= 1 && filter.limit % 1 === 0,
			"[rovy/scribe] diagnostics log limit must be a positive integer",
		);
	}
}

function isLogLevel(value: unknown): value is ScribeLogEntry["level"] {
	return value === "Debug" ||
		value === "Info" ||
		value === "Warn" ||
		value === "Error" ||
		value === "Fatal";
}

function isLogCategory(
	value: unknown,
): value is ScribeLogEntry["category"] {
	return value === "Persistence" ||
		value === "Replication" ||
		value === "Transport" ||
		value === "Commands" ||
		value === "Leaderboards" ||
		value === "Monetization" ||
		value === "Gifting" ||
		value === "Integrity" ||
		value === "Lifecycle";
}
