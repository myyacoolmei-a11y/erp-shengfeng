import { Redirect } from "wouter";

/** @deprecated 請使用 /partner-culture */
export default function PartnerAdmin() {
  return <Redirect to="/partner-culture" />;
}
