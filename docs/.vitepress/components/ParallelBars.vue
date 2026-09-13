<script setup>
defineProps({
  rows: Array,
  maximum: Number,
  numbers: Boolean,
  budget: Boolean,
});
</script>

<template>
  <div class="parallel-bars">
    <div v-for="row in rows" :key="row.label" class="bar-row">
      <div class="bar-label">
        <span>{{ row.label }}</span
        ><span v-if="numbers" class="value">{{ row.value.toFixed(2) }} ms</span>
      </div>
      <div
        class="track"
        role="img"
        :aria-label="`${row.label}: ${row.value.toFixed(2)} milliseconds`"
      >
        <div
          class="fill"
          :class="row.style"
          :style="{ width: `${(row.value / maximum) * 100}%` }"
        />
        <span
          v-if="budget"
          class="budget"
          :style="{ left: `${(1000 / 60 / maximum) * 100}%` }"
        />
      </div>
    </div>
    <div class="axis">
      <span>Less time</span
      ><span
        >More time
        <span v-if="numbers">· {{ maximum.toFixed(2) }} ms</span></span
      >
    </div>
  </div>
</template>

<style scoped>
.bar-row {
  margin: 0 0 15px;
}
.bar-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 5px;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}
.track {
  height: 18px;
  background: var(--vp-c-bg-soft);
  position: relative;
}
.fill {
  height: 100%;
  transition: width 0.2s ease;
  background: var(--parallel-direct);
}
.fill.serial {
  background: var(--parallel-serial);
}
.fill.default {
  background: var(--parallel-default);
}
.fill.best {
  background: var(--parallel-best);
}
.axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 6px;
  color: var(--vp-c-text-2);
  font-size: 11px;
}
.budget {
  position: absolute;
  top: -3px;
  bottom: -3px;
  border-left: 2px dashed var(--vp-c-text-2);
}
@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}
</style>
