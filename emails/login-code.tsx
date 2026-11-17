import { brand } from "../lib/brand";
import * as React from "react";
import { Text } from "@react-email/components";
import type { LoginCodeEmailProps } from "./types";
import { Layout, Muted, c } from "./components/layout";

export function subject(p: LoginCodeEmailProps): string {
  return `${p.code} is your ${brand.name} login code`;
}

export default function LoginCodeEmail(p: LoginCodeEmailProps) {
  return (
    <Layout appUrl={p.appUrl} preview={`Your login code is ${p.code}`} icon="key" title={<>Your {brand.name} login code</>}>
      <Text style={{ fontFamily: "Menlo, Consolas, monospace", fontSize: "32px", letterSpacing: "0.3em", textAlign: "center", color: c.ink, margin: "6px 0 18px" }}>
        {p.code}
      </Text>
      <Muted>Enter this code to finish signing in. It expires in 10 minutes and can be used once.</Muted>
      <Muted>If you didn&apos;t try to sign in, you can ignore this email.</Muted>
    </Layout>
  );
}
