const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export type ApiPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type ApiDashboard = {
  conversations: number;
  newLeads: number;
  hotLeads: number;
  appointments: number;
  aiHandled: number;
  humanHandled: number;
  byChannel: { channel: string; count: number; percentage: number }[];
  funnel: { contacts: number; contacted: number; qualified: number; hot: number; appointments: number };
  conversion: { newLeadToAppointment: number; hotToAppointment: number };
};
export type ApiContact = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName?: string | null;
  leadTemperature: "COLD" | "WARM" | "HOT";
  leadScore: number;
  lastInteractionAt?: string | null;
  tags?: { tag: { name: string; color?: string | null } }[];
};
export type OrganizationInfo = {
  id: string;
  name: string;
  slug: string;
  status: string;
  mode: string;
  plan: BillingPlan;
  timezone?: string;
  industry?: string | null;
  website?: string | null;
  description?: string | null;
  notificationSettings?: Record<string, unknown> | null;
  securitySettings?: Record<string, unknown> | null;
};
export type ActiveSessionInfo = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean; device: string; location: string };
export type AuditLogInfo = { id: string; action: string; entityType: string; entityId?: string | null; metadata?: unknown; createdAt: string };
export type ApiMessage = {
  id: string;
  content: string;
  senderType: "CONTACT" | "AI" | "USER" | "SYSTEM";
  createdAt: string;
};
export type ApiConversation = {
  id: string;
  organizationId: string;
  channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK";
  status: "OPEN" | "CLOSED" | "ARCHIVED";
  aiStatus: "ACTIVE" | "PAUSED" | "TRANSFERRED";
  assignedUserId?: string | null;
  summary?: string | null;
  lastMessageAt?: string | null;
  contact: ApiContact;
  messages?: ApiMessage[];
  appointments?: unknown[];
};
export type KnowledgeKind = "faqs" | "products" | "services" | "promotions" | "schedules" | "policies";
export type KnowledgeRecord = Record<string, unknown> & { id: string; name?: string; title?: string; question?: string; code?: string; sku?: string; active?: boolean; updatedAt?: string; deletedAt?: string | null };
export type PromptInfo = { id: string; agentName: string; publishedVersion?: { content: string; versionNumber: number } | null; versions?: { id: string; content: string; versionNumber: number; status: string; createdAt: string; publishedAt?: string | null }[] };
export type BillingInterval = "MONTHLY" | "YEARLY";
export type BillingPlan = "STARTER" | "PRO" | "ENTERPRISE";
export type BillingMockAction = "ACTIVATE_PLAN" | "CHANGE_PLAN" | "CANCEL_RENEWAL" | "RENEW" | "EXPIRE_TRIAL";
export type TeamRole = "ORGANIZATION_ADMIN" | "SUPERVISOR" | "AGENT";
export type TeamMember = { id: string; role: TeamRole; createdAt: string; temporaryPassword?: string; user: { id: string; name: string; email: string; status: string; createdAt: string } };
export type ChannelStatusInfo = { channel: "INSTAGRAM" | "WHATSAPP" | "FACEBOOK"; label: string; provider: string; status: "NOT_CONNECTED" | "CONFIGURING" | "CONNECTED" | "CONNECTED_MOCK" | "PENDING" | "ERROR" | "TOKEN_EXPIRED"; isMock: boolean; accountLabel: string; lastSyncAt: string; message: string; ok?: boolean };
export type MetaSyncResult = { synced: boolean; checked: number; created: number; skipped: number; errors: string[] };
export type PlanPrice = { id: string; plan: BillingPlan; interval: BillingInterval; currency: string; amountCents: number; monthlyContactsLimit: number; seatsLimit: number; channelsLimit: number; aiResponsesLimit: number; active: boolean; stripePriceId?: string | null };
export type SubscriptionInfo = { id: string; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE"; trialEndsAt: string; currentPeriodEndsAt: string; trialDays: number; trialConversationLimit: number; trialDaysLeft: number; trialExpired: boolean; cancelAtPeriodEnd?: boolean; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null; planPrice: PlanPrice };
export type BillingUsage = {
  period: { startsAt: string; endsAt: string };
  limits: { contacts: number; conversations: number; seats: number; channels: number; aiResponses: number };
  usage: { contacts: number; seats: number; channels: number; aiResponses: number; conversations: number; messagesReceived: number; messagesSent: number };
  remaining: { contacts: number; conversations: number; seats: number; channels: number; aiResponses: number };
  percentages: { contacts: number; conversations: number; seats: number; channels: number; aiResponses: number };
  warnings: { contacts: string | null; conversations: string | null; seats: string | null; channels: string | null; aiResponses: string | null };
  conversations?: number;
  conversationLimit?: number;
  trialConversationLimit?: number | null;
  monthlyContactsLimit?: number;
  seatsLimit?: number;
  percent?: number;
};

function csrfToken() {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((item) => item.startsWith("nexoia_csrf="))?.split("=")[1] ?? "";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...(method !== "GET" ? { "x-csrf-token": csrfToken() } : {}), ...init.headers } });
  } catch {
    throw new Error("No se pudo conectar con la API. Verifica que el backend este encendido en http://localhost:3001.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : body?.error?.message ?? "No fue posible completar la solicitud");
  return body as T;
}

export const api = {
  login: (email: string, password: string, remember = false) => request<{ role: string; requiresOrganizationSelection: boolean }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, remember }) }),
  register: (data: { name: string; email: string; password: string; businessName: string; plan: BillingPlan; interval: BillingInterval }) => request<{ role: string; requiresOrganizationSelection: boolean; trialEndsAt: string }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  forgotPassword: (email: string) => request<{ ok: boolean; message: string; resetToken?: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ ok: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  session: () => request<{ userId: string; organizationId: string; role: string }>("/auth/session"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  dashboard: () => request<ApiDashboard>("/dashboard"),
  organization: () => request<OrganizationInfo>("/organization/current"),
  updateOrganization: (data: Partial<OrganizationInfo>) => request<OrganizationInfo>("/organization/current", { method: "PATCH", body: JSON.stringify(data) }),
  teamMembers: () => request<TeamMember[]>("/team/members"),
  teamInvite: (data: { name: string; email: string; role: TeamRole }) => request<TeamMember>("/team/members", { method: "POST", body: JSON.stringify(data) }),
  teamUpdateRole: (id: string, role: TeamRole) => request<TeamMember>(`/team/members/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  teamRemove: (id: string) => request<{ ok: boolean }>(`/team/members/${encodeURIComponent(id)}`, { method: "DELETE" }),
  channels: () => request<ChannelStatusInfo[]>("/channels"),
  channelConnect: (channel: ChannelStatusInfo["channel"]) => request<ChannelStatusInfo>(`/channels/${channel}/connect`, { method: "POST" }),
  channelDisconnect: (channel: ChannelStatusInfo["channel"]) => request<ChannelStatusInfo>(`/channels/${channel}/disconnect`, { method: "POST" }),
  channelTest: (channel: ChannelStatusInfo["channel"]) => request<ChannelStatusInfo>(`/channels/${channel}/test`, { method: "POST" }),
  syncInstagram: () => request<MetaSyncResult>("/meta/instagram/sync", { method: "POST" }),
  contacts: (page = 1, search = "") => request<ApiPage<ApiContact>>(`/contacts?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  createContact: (data: { firstName: string; lastName?: string; email?: string; phone?: string; leadTemperature?: ApiContact["leadTemperature"]; leadScore?: number }) => request<ApiContact>("/contacts", { method: "POST", body: JSON.stringify(data) }),
  updateContact: (id: string, data: Partial<ApiContact>) => request<ApiContact>(`/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  conversations: (page = 1) => request<ApiPage<ApiConversation>>(`/conversations?page=${page}`),
  conversation: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}`),
  sendMessage: (id: string, content: string) => request<ApiMessage>(`/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
  aiReply: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}/ai-reply`, { method: "POST" }),
  takeConversation: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}/take`, { method: "POST" }),
  returnConversationToAi: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}/return-to-ai`, { method: "POST" }),
  closeConversation: (id: string) => request<ApiConversation>(`/conversations/${encodeURIComponent(id)}/close`, { method: "POST" }),
  saveNote: (contactId: string, content: string) => request("/notes", { method: "POST", body: JSON.stringify({ contactId, content }) }),
  currentPrompt: () => request<PromptInfo | null>("/prompts/current"),
  savePrompt: (agentName: string, content: string, publish: boolean) => request("/prompts", { method: "POST", body: JSON.stringify({ agentName, content, publish }) }),
  simulateAi: (message: string, channel: string, turn: number) => request<{ provider: string; model: string; agentName: string; reply: string }>("/ai/simulate", { method: "POST", body: JSON.stringify({ message, channel, turn }) }),
  automations: () => request("/automations"),
  createAppointment: (contactId: string, conversationId: string, scheduledAt: string) => request("/appointments", { method: "POST", body: JSON.stringify({ contactId, conversationId, scheduledAt }) }),
  knowledgeList: (kind: KnowledgeKind, search = "") => request<ApiPage<KnowledgeRecord>>(`/knowledge-base/${kind}?page=1&pageSize=25${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  knowledgeCreate: (kind: KnowledgeKind, data: Record<string, unknown>) => request<KnowledgeRecord>(`/knowledge-base/${kind}`, { method: "POST", body: JSON.stringify(data) }),
  knowledgeUpdate: (kind: KnowledgeKind, id: string, data: Record<string, unknown>) => request<KnowledgeRecord>(`/knowledge-base/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  knowledgeDelete: (kind: KnowledgeKind, id: string) => request<{ ok: boolean }>(`/knowledge-base/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  billingPlans: () => request<PlanPrice[]>("/billing/plans"),
  billingSubscription: () => request<SubscriptionInfo>("/billing/subscription"),
  billingUsage: () => request<BillingUsage>("/billing/usage"),
  billingCheckout: (planPriceId: string) => request<{ provider: string; status: string; checkoutUrl: string | null; message: string; planPrice: PlanPrice }>("/billing/checkout", { method: "POST", body: JSON.stringify({ planPriceId }) }),
  billingSimulate: (action: BillingMockAction, planPriceId?: string) => request<{ provider: string; mode: string; action: BillingMockAction; stripeTouched: boolean; message: string; subscription: SubscriptionInfo }>("/billing/simulate", { method: "POST", body: JSON.stringify({ action, planPriceId }) }),
  activeSessions: () => request<ActiveSessionInfo[]>("/security/sessions"),
  revokeOtherSessions: () => request<{ ok: boolean }>("/security/sessions/revoke-others", { method: "POST" }),
  audit: () => request<ApiPage<AuditLogInfo>>("/audit?page=1&pageSize=25"),
};
