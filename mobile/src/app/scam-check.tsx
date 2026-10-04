import { Redirect } from "expo-router";

/** Old link target. Any `uri` parameter is dropped: other apps must not choose what gets uploaded. */
export default function ScamCheck() {
  return <Redirect href="/scan" />;
}
