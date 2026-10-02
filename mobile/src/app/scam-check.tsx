import { Redirect, useLocalSearchParams } from "expo-router";

/** Kept for links that pass an image `uri`; the shared Quick Capture flow handles it. */
export default function ScamCheck() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  return (
    <Redirect href={uri ? { pathname: "/quick-capture", params: { uri } } : "/quick-capture"} />
  );
}
