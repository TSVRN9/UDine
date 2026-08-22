import type { DiningEvent } from "@udine/shared";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { classifyEventTap, type EventDetailParams } from "./eventTapTarget";

/**
 * Shared tap dispatcher for a DiningEvent card -- classifyEventTap decides the destination, this
 * does the actual navigation/open. Single source of truth for both the Social pane's EventCard and
 * the standalone /events screen (PR #129 review, non-blocking finding: they'd drifted -- one opened
 * the in-app pamphlet/pop-up browser, the other hand-rolled `Linking.openURL` with no scheme guard).
 *
 * openBrowserAsync's promise is awaited/caught, not floated -- PR #129 review finding 4: a rapid
 * double-tap on a link card makes the second call reject ("Another WebBrowser is already being
 * presented"), which a floating promise would swallow as a silent unhandled rejection. Same
 * try/catch + Alert.alert pattern as SocialPane.tsx's handleSignIn.
 */
export async function openEventTap(item: DiningEvent): Promise<void> {
  const target = classifyEventTap(item);
  if (target.kind === "link") {
    try {
      await WebBrowser.openBrowserAsync(target.url);
    } catch (err) {
      Alert.alert("Couldn't open link", err instanceof Error ? err.message : String(err));
    }
  } else if (target.kind === "content") {
    const params: EventDetailParams = {
      title: item.title,
      featuredImage: item.featuredImage,
      pamphletImage: target.pamphletImage,
      expirationDate: item.expirationDate,
      isFeatured: item.isFeatured ? "1" : "",
    };
    router.push({ pathname: "/event-detail", params });
  }
  // target.kind === "none" -- malformed/missing payload, safe no-op.
}
