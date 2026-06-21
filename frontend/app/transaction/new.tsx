import { useLocalSearchParams } from "expo-router";

import TransactionForm from "@/src/components/TransactionForm";

export default function NewTransaction() {
  const params = useLocalSearchParams<{
    type?: "income" | "expense";
    draft?: string;
    audio?: string;
    audioMime?: string;
  }>();
  let draft = null;
  if (params.draft) {
    try {
      draft = JSON.parse(params.draft);
    } catch {
      // ignore
    }
  }
  const draftAudio = params.audio
    ? { base64: params.audio, mime: params.audioMime ?? "audio/m4a" }
    : null;
  return (
    <TransactionForm
      mode="new"
      draftType={params.type ?? draft?.type ?? "expense"}
      draft={draft}
      draftAudio={draftAudio}
    />
  );
}
