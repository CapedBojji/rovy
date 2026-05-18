--!nocheck

local testing = zune.testing

local function failedCount(): number
	-- Intentionally coupled to zune.testing internals: zune.run currently does
	-- not expose a public report/exit API. We read `_failed` as the canonical
	-- per-process failure counter so package scripts can exit non-zero.
	return testing._failed
end

return {
	failedCount = failedCount,
}
