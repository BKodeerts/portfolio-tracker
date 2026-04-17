function periodCutoff(period) {
  return null;
}
function filterByPeriod(data, period) {
  const cutoff = periodCutoff();
  if (!cutoff) return data;
  return data.filter((d) => d.date >= cutoff);
}
export {
  filterByPeriod as f
};
