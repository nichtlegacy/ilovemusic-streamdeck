// Datasource payload shape consumed by the local property-inspector bridge.

export type DataSourcePayload = {
  event: string;
  items: DataSourceResult;
};

export type DataSourceResult = DataSourceResultItem[];

export type DataSourceResultItem = Item | ItemGroup;

export type Item = {
  disabled?: boolean;
  label?: string;
  value: string;
};

export type ItemGroup = {
  label?: string;
  children: Item[];
};
