// 未来同步器的统一接口。MVP 只定义接口与文档注释,不做实现。
export type CrmAgent = { externalId: string; name: string; email: string | null };
export type CrmSale = { externalId: string; agentExternalId: string; address: string; salePriceCents: number; gciCents: number; saleDate: string };
export type CrmListing = { externalId: string; agentExternalId: string; address: string; listPriceCents: number; listedDate: string };
export interface CrmAdapter {
  fetchAgents(): Promise<CrmAgent[]>;
  fetchSales(since: Date): Promise<CrmSale[]>;
  fetchListings(since: Date): Promise<CrmListing[]>;
}
// 首个实现计划为 Agentbox(https://www.agentboxcrm.com.au API);同步器将按 externalId 幂等 upsert 并触发与手动录入相同的广播逻辑。
