--!nocheck
local a = { [1] = "a" }
local b = { [1] = "a", [2] = "b" }
print('a size', a.size)
print('a_sizefunc', type(a.size))
print('a size call', a:size())
print('b size', b:size())
