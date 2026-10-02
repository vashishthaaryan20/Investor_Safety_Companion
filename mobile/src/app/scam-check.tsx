import { useLocalSearchParams } from "expo-router";
import { View, Image, Text } from "react-native";

export default function ScamCheck() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Selected message</Text>
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: 400 }} resizeMode="contain" />
      ) : (
        <Text>No image received</Text>
      )}
      {/* Next: pass `uri` to Anwesha's upload / analysis function */}
    </View>
  );
}