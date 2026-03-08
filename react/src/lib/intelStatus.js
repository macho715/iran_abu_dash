export function countIntelStatuses(feed = []) {
  const counts = feed.reduce(
    (acc, item) => {
      const status = item?.status || "fresh";

      if (status === "fresh") {
        acc.freshCount += 1;
      } else if (status === "repeated") {
        acc.repeatedCount += 1;
      } else if (status === "official") {
        acc.officialCount += 1;
      }

      return acc;
    },
    {
      freshCount: 0,
      repeatedCount: 0,
      officialCount: 0,
    }
  );

  return {
    ...counts,
    hasFresh: counts.freshCount + counts.officialCount > 0,
  };
}
