import { Alert, Linking } from "react-native";

/** Opens a phone number or website, explaining what to do if the phone can't. */
export async function openLink(url: string, label?: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    const isPhone = url.startsWith("tel:");
    const target = isPhone ? url.replace("tel:", "") : url;
    Alert.alert(
      isPhone ? "Couldn't start the call" : "Couldn't open the link",
      isPhone
        ? `Your device can't make calls from here. Dial ${target} from your phone app${label ? ` (${label})` : ""}.`
        : `Open this address in your browser:\n${target}`
    );
  }
}
