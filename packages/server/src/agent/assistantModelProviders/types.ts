import type {AssistantModelCatalog} from '@sodashitsu/protocol';
/** Read-only CLI/SDK catalog. No session or prompt is created to discover choices. */
export type AssistantModelProviderResult=Pick<AssistantModelCatalog,'models'|'message'>&{
 source:'cli'|'local-cache'|'reference'|'unavailable';
};
