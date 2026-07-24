--!strict

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RuntimeLib = require(ReplicatedStorage.rbxts_include.RuntimeLib)
local schemaModule = RuntimeLib.import(
	script,
	ReplicatedStorage.RovyScribe.schema
)

local DATA_ID = "native-runtime-gate"
local SECOND_DATA_ID = "native-runtime-gate-secondary"
local COMMAND_ID = "native-runtime-gate:equip"
local SHARED_USER_ID_OFFSET = 2000000

local function eventClass(kind: string)
	local class = {}
	class.__index = class
	function class.new()
		return setmetatable({
			_kind = kind,
		}, class)
	end
	return class
end

local EquipItem = {}
EquipItem.__index = EquipItem
function EquipItem.new(itemId: string)
	return setmetatable({
		itemId = itemId,
	}, EquipItem)
end

local EquipItemResult = {}
EquipItemResult.__index = EquipItemResult
function EquipItemResult.new(equipped: boolean)
	return setmetatable({
		equipped = equipped,
	}, EquipItemResult)
end

local Events = {
	Ready = eventClass("ready"),
	CoinsChanged = eventClass("changed"),
	InventoryItemAdded = eventClass("keyAdded"),
	QueueInserted = eventClass("inserted"),
	QueueRemoved = eventClass("removed"),
	InventoryItemRemoved = eventClass("keyRemoved"),
	OwnershipChanged = eventClass("ownershipChanged"),
	SharedChanged = eventClass("sharedChanged"),
	GiftReceived = eventClass("giftReceived"),
	GiftCredit = eventClass("giftCredit"),
	Leaderboard = eventClass("leaderboard"),
	ServiceStatus = eventClass("serviceStatus"),
	Issue = eventClass("issue"),
	Message = eventClass("message"),
	Save = eventClass("save"),
	SessionEnded = eventClass("sessionEnded"),
	Anomaly = eventClass("anomaly"),
	CommandCompleted = eventClass("commandCompleted"),
}

local definition = {
	id = DATA_ID,
	name = "RovyScribeNativeRuntimeGate",
	profileStoreIndex = "RovyScribeNativeRuntimeGate",
	profileKeyPrefix = "PLAYER_",
	template = {
		Coins = schemaModule.s:int(0, {
			min = 0,
			max = 1000,
		}),
		EquippedItem = schemaModule.s:string("", {
			maxLength = 64,
		}),
		Inventory = schemaModule.s:dictOf({
			Amount = schemaModule.s:int(1, {
				min = 1,
				max = 99,
			}),
		}, {
			maxKeys = 20,
			maxKeyLength = 64,
		}),
		Queue = schemaModule.s:arrayOf(
			schemaModule.s:string("", {
				maxLength = 64,
			}),
			{
				maxItems = 20,
			}
		),
		CreatedAt = schemaModule.s:int(0, {
			min = 0,
		}),
		Enabled = false,
		ActiveBoost = schemaModule.s:timed(1),
		Public = schemaModule.s:shared({
			Title = schemaModule.s:string("", {
				maxLength = 32,
			}),
		}),
		Secret = schemaModule.s:serverOnly({
			Flagged = false,
		}),
		Runtime = schemaModule.s:session({
			InCombat = false,
		}),
	},
	options = {
		UseMock = true,
		OwnReceipts = false,
		KickOnSessionEnd = false,
		BoundsPolicy = "Reject",
		RequestTimeout = 5,
		LogLevel = "Fatal",
		Banner = false,
		Perks = { "VIP" },
		Leaderboards = {
			TopCoins = {
				Stat = "Coins",
				Limit = 10,
				Replicate = true,
			},
		},
		Economy = {
			Prefix = true,
			Currencies = {
				Coins = {
					Label = "Gold",
					Fields = { "Region" },
				},
			},
		},
			Products = {
				CoinsPack = {
					Id = 987654,
					Category = "Currency",
				},
				VipGift = {
					Id = 987655,
					Category = "Perk",
					Grants = "VIP",
				},
			},
		PurchaseLog = {
			RobuxCap = 20,
			InGameCap = 20,
			ReplicateRobux = true,
			ReplicateInGame = true,
		},
		TransportChannel = "@rovy/scribe:native-runtime-gate",
	},
	publicToken = table.freeze({
		id = DATA_ID,
		name = "RovyScribeNativeRuntimeGate",
	}),
}

local secondDefinition = {
	id = SECOND_DATA_ID,
	name = "RovyScribeNativeRuntimeGateSecondary",
	profileStoreIndex = "RovyScribeNativeRuntimeGateSecondary",
	profileKeyPrefix = "PLAYER_",
	template = {
		Points = schemaModule.s:int(0, {
			min = 0,
			max = 100,
		}),
	},
	options = {
		UseMock = true,
		OwnReceipts = false,
		KickOnSessionEnd = false,
		LogLevel = "Fatal",
		Banner = false,
		TransportChannel = "@rovy/scribe:native-runtime-gate-secondary",
	},
	publicToken = table.freeze({
		id = SECOND_DATA_ID,
		name = "RovyScribeNativeRuntimeGateSecondary",
	}),
}

local commandDefinition = {
	id = COMMAND_ID,
	name = "EquipItem",
	dataId = DATA_ID,
	ctor = EquipItem,
	fields = { "itemId" },
	optionalFields = {},
	fieldTypes = {
		{
			kind = "string",
		},
	},
	result = EquipItemResult,
	resultFields = { "equipped" },
	resultOptionalFields = {},
	resultFieldTypes = {
		{
			kind = "boolean",
		},
	},
}

local function pathRoute(
	id: string,
	ctor: any,
	kind: string,
	path: string
)
	return {
		definition = {
			id = id,
			ctor = ctor,
			dataId = DATA_ID,
			kind = kind,
			path = path,
		},
		send = true,
		trigger = true,
		path = string.split(path, "."),
	}
end

local function dataRoute(id: string, ctor: any, kind: string)
	return {
		definition = {
			id = id,
			ctor = ctor,
			dataId = DATA_ID,
			kind = kind,
		},
		send = true,
		trigger = true,
	}
end

local function commonRoutes()
	return {
		dataRoute("native-runtime:ready", Events.Ready, "ready"),
		pathRoute(
			"native-runtime:coins",
			Events.CoinsChanged,
			"changed",
			"Coins"
		),
		pathRoute(
			"native-runtime:inventory-added",
			Events.InventoryItemAdded,
			"keyAdded",
			"Inventory"
		),
		pathRoute(
			"native-runtime:queue-inserted",
			Events.QueueInserted,
			"inserted",
			"Queue"
		),
		pathRoute(
			"native-runtime:queue-removed",
			Events.QueueRemoved,
			"removed",
			"Queue"
		),
		pathRoute(
			"native-runtime:inventory-removed",
			Events.InventoryItemRemoved,
			"keyRemoved",
			"Inventory"
		),
		dataRoute(
			"native-runtime:ownership",
			Events.OwnershipChanged,
			"ownershipChanged"
		),
		dataRoute(
			"native-runtime:leaderboard",
			Events.Leaderboard,
			"leaderboard"
		),
		dataRoute(
			"native-runtime:service-status",
			Events.ServiceStatus,
			"serviceStatus"
		),
	}
end

local function serverRoutes()
	local routes = commonRoutes()
	table.insert(
		routes,
		dataRoute("native-runtime:save", Events.Save, "save")
	)
	table.insert(
		routes,
		dataRoute("native-runtime:anomaly", Events.Anomaly, "anomaly")
	)
	table.insert(
		routes,
		dataRoute("native-runtime:issue", Events.Issue, "issue")
	)
	table.insert(
		routes,
		dataRoute("native-runtime:message", Events.Message, "message")
	)
	table.insert(
		routes,
		dataRoute(
			"native-runtime:gift-received",
			Events.GiftReceived,
			"giftReceived"
		)
	)
	table.insert(
		routes,
		dataRoute(
			"native-runtime:gift-credit",
			Events.GiftCredit,
			"giftCredit"
		)
	)
	table.insert(
		routes,
		dataRoute(
			"native-runtime:session-ended",
			Events.SessionEnded,
			"sessionEnded"
		)
	)
	return routes
end

local function clientRoutes()
	local routes = commonRoutes()
	table.insert(
		routes,
		dataRoute(
			"native-runtime:shared-changed",
			Events.SharedChanged,
			"sharedChanged"
		)
	)
	table.insert(routes, {
		definition = {
			id = "native-runtime:command-completed",
			ctor = Events.CommandCompleted,
			commandId = COMMAND_ID,
			kind = "commandCompleted",
		},
		send = true,
		trigger = true,
	})
	return routes
end

local Fixture = {
	DataId = DATA_ID,
	SecondDataId = SECOND_DATA_ID,
	CommandId = COMMAND_ID,
	SharedUserIdOffset = SHARED_USER_ID_OFFSET,
	Definition = definition,
	SecondDefinition = secondDefinition,
	CommandDefinition = commandDefinition,
	CommandPlan = {
		definition = commandDefinition,
		consumerCount = 1,
	},
	EquipItem = EquipItem,
	EquipItemResult = EquipItemResult,
	Events = Events,
	ServerRoutes = serverRoutes,
	ClientRoutes = clientRoutes,
}

return table.freeze(Fixture)
