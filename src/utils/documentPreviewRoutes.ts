import { isQuotePreviewRoute } from './quotePreviewStorage';
import { isJobOrderPreviewRoute } from './jobOrderPreviewStorage';

export function isStandaloneDocumentPreviewRoute(): boolean {
  return isQuotePreviewRoute() || isJobOrderPreviewRoute();
}
