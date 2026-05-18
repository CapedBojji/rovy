--!nocheck

local function equal(name: string, value: any, expected: any)
	if value ~= expected then
		error(string.format("%s: expected %s, got %s", name, tostring(expected), tostring(value)), 2)
	end
end

local function atLeast(name: string, value: any, minimum: number)
	if type(value) ~= "number" or value < minimum then
		error(string.format("%s: expected >= %s, got %s", name, tostring(minimum), tostring(value)), 2)
	end
end

local function truthy(name: string, value: any)
	if not value then
		error(string.format("%s: expected truthy, got %s", name, tostring(value)), 2)
	end
end

local function falsy(name: string, value: any)
	if value then
		error(string.format("%s: expected falsy, got %s", name, tostring(value)), 2)
	end
end

return {
	equal = equal,
	atLeast = atLeast,
	truthy = truthy,
	falsy = falsy,
}
