import { View } from "react-native";
import { m2 } from "../../lib/theme";
import { Band, Text } from "../../bakeoff/ui";

export default function Halls() {
  return (
    <View style={{ flex: 1, backgroundColor: m2.color.chalk }}>
      <View style={{ backgroundColor: m2.color.dm, paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Text v="brand" color={m2.color.gold}>UDine</Text>
        <Text v="hallTitle" color={m2.color.white}>Halls</Text>
      </View>
      <View style={{ backgroundColor: m2.color.dm }}>
        <Band name="Worcester" />
      </View>
    </View>
  );
}
