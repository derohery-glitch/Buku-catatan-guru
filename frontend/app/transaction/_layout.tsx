import { Stack } from "expo-router";

export default function TransactionStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
        contentStyle: { backgroundColor: "#FAF9F6" },
      }}
    />
  );
}
