import {z} from 'zod';
import {UsageInsightFilters,UsageHistoryParams,type HistoryTokens} from './usageAnalytics.js';
export const UsageInsightsParams=UsageHistoryParams.and(UsageInsightFilters);
export type UsageInsightsParams=z.infer<typeof UsageInsightsParams>;
export interface InsightGroup extends HistoryTokens {key:string;label:string;calls:number;tools:number;errors:number;knownResults:number;}
export interface InsightSession extends InsightGroup {kind:string;parent:string|null;role:'main'|'sub'|'unknown';project:string;account:string;firstAt:number;lastAt:number;}
export interface InsightTool {name:string;category:string;basis:'direct'|'inferred';nested?:boolean;calls:number;success:number;failed:number;unknown:number;}
export interface InsightCoverage {kind:string;files:number;pending:number;missing:number;invalid:number;oversized:number;firstAt:number|null;lastAt:number|null;limited:boolean;}
export interface UsageInsights {
 from:string;to:string;asOf:number;timezone:string;partial:boolean;collecting:boolean;retainedFrom:string;
 activity:{started:number;completed:number;aborted:number;failed:number};
 totals:InsightGroup;previous:InsightGroup;byDay:InsightGroup[];byDayRole:InsightGroup[];previousByDay:InsightGroup[];byKind:InsightGroup[];byModel:InsightGroup[];byProject:InsightGroup[];byAccount:InsightGroup[];byRole:InsightGroup[];byHour:InsightGroup[];
 tools:InsightTool[];sessions:InsightSession[];coverage:InsightCoverage[];
 options:{kinds:string[];models:string[];projects:{key:string;label:string}[];accounts:{key:string;label:string}[]};
}
