import type { ReactNode } from "react";

export interface Labels {
  status?: string; onStatus?: () => void; busy?: ReactNode; board?: ReactNode;
  meals?: { items: { key: string; label: string }[]; selected: string; onSelect: (key: string) => void };
  station?: { label: string; onPress: () => void; open?: boolean };
  day?: { label: string; accessibilityLabel: string; onPress: () => void };
  /** The tab and station labels arrived from the network just now: they fade in where they end up (the status and busy lines come in at once, as in M2). */
  arrive?: { menu?: boolean };
}
