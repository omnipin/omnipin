type DataSet = {
  dataSetId: bigint
  pdpEndEpoch: bigint
  providerId: bigint
}

export function getReusableDataSets<T extends DataSet>(
  dataSets: readonly T[],
  providerId: bigint,
): T[] {
  // The current Omnipin upload path could not add pieces to data set 0.
  return dataSets.filter(
    (ds) =>
      ds.providerId === providerId &&
      ds.pdpEndEpoch === 0n &&
      ds.dataSetId !== 0n,
  )
}
