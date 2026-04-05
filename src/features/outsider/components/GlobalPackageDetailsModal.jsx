import PackageDetailsModal from './PackageDetailsModal';
import { packageDetailsModalDepsRef } from '@/features/outsider/stores/packageDetailsModalDepsRef';

/**
 * Mount once under the router (with Auth + Currency providers) so any route can
 * use `openPackageDetailsModal` from the store. Register deps from the owning page
 * via `packageDetailsModalDepsRef`.
 */
export default function GlobalPackageDetailsModal() {
  return <PackageDetailsModal depsRef={packageDetailsModalDepsRef} />;
}
