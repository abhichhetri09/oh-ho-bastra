import {
  CollectionHeaderSkeleton,
  ListingSkeleton,
} from "@/modules/catalog/components/skeletons";

export default function Loading() {
  return (
    <div className="container-page">
      <CollectionHeaderSkeleton />
      <ListingSkeleton />
    </div>
  );
}
