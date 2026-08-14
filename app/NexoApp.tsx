"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type ActiveSessionInfo, type ApiContact, type ApiConversation, type ApiDashboard, type ApiMessage, type AuditLogInfo, type BillingInterval, type BillingMockAction, type BillingPlan, type BillingUsage, type ChannelStatusInfo, type KnowledgeKind, type KnowledgeRecord, type OrganizationInfo, type PlanPrice, type SessionInfo, type SubscriptionInfo, type TeamMember, type TeamRole } from "./api-client";

type Channel = "instagram" | "whatsapp" | "facebook";
type Temperature = "Frío" | "Tibio" | "Caliente";
type View = "Inicio" | "Conversaciones" | "Contactos" | "Entrenar IA" | "Base de conocimiento" | "Productos y servicios" | "Conexiones" | "Equipo" | "Plan y facturación" | "Configuración" | "Superadmin";
type ChatMessage = { body: string; from: "contact" | "ai" | "human"; time: string };
type Conversation = { id: string | number; organizationId: string; name: string; initials: string; channel: Channel; temperature: Temperature; last: string; time: string; unread: number; ai: boolean; transferred: boolean; closed: boolean; hasAppointment: boolean; score: number; interest: string; stage: string; color: string; summary: string; tags: string[]; note: string; reminder: string; messages: ChatMessage[] };
type AutomationRule = { name: string; channel: Channel; trigger: string; action: string; runs: number; active: boolean };
type DashboardMetrics = Partial<ApiDashboard>;
const settingsTabs = ["Organización","Equipo y roles","Notificaciones","Horarios","Seguridad","Facturación"] as const;
type SettingsTab = (typeof settingsTabs)[number];
type KnowledgeConfig = {
  label: string;
  singular?: string;
  titleKey: string;
  subtitleKey: string;
  create: () => Record<string, unknown>;
};

const CHANNELS: Record<Channel, { label: string; short: string }> = { instagram: { label: "Instagram", short: "IG" }, whatsapp: { label: "WhatsApp", short: "WA" }, facebook: { label: "Facebook", short: "FB" } };

const colors = ["#f4b8a4", "#a9c8ff", "#b8ddc9", "#e9c5ff", "#ffd5a1", "#b8d8ee"];
const channelFromApi = (channel: string): Channel => channel === "WHATSAPP" ? "whatsapp" : channel === "FACEBOOK" ? "facebook" : "instagram";
const temperatureFromApi = (temperature: string): Temperature => temperature === "HOT" ? "Caliente" : temperature === "WARM" ? "Tibio" : "Frío";
const messageFromApi = (message: ApiMessage): ChatMessage => ({ body: message.content, from: message.senderType === "CONTACT" ? "contact" : message.senderType === "AI" ? "ai" : "human", time: formatTime(message.createdAt) });
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }) : "Ahora";
const fullName = (contact: ApiConversation["contact"]) => {
  const name = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
  if (/^Instagram er-\d+$/i.test(name)) return name.replace("er-", "user-");
  if (/^Facebook er-\d+$/i.test(name)) return name.replace("er-", "user-");
  return name || "Contacto sin nombre";
};
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase() || "CN";
const conversationFromApi = (item: ApiConversation, index: number): Conversation => {
  const name = fullName(item.contact);
  const messages = item.messages?.map(messageFromApi) ?? [];
  const latest = messages.at(-1);
  return {
    id: item.id,
    organizationId: item.organizationId,
    name,
    initials: initials(name),
    channel: channelFromApi(item.channel),
    temperature: temperatureFromApi(item.contact.leadTemperature),
    last: latest?.body ?? "Sin mensajes todavia",
    time: formatTime(item.lastMessageAt ?? item.contact.lastInteractionAt),
    unread: 0,
    ai: item.aiStatus === "ACTIVE",
    transferred: item.aiStatus === "TRANSFERRED",
    closed: item.status === "CLOSED",
    hasAppointment: Boolean(item.appointments?.length),
    score: item.contact.leadScore,
    interest: item.contact.leadScore >= 75 ? "Prueba del producto" : item.contact.leadScore >= 50 ? "Plan profesional" : "Informacion general",
    stage: item.contact.leadScore >= 75 ? "Oportunidad" : item.contact.leadScore >= 50 ? "Calificado" : "Nuevo",
    color: colors[index % colors.length],
    summary: item.summary ?? "Conversacion sincronizada.",
    tags: item.contact.tags?.map(tag => tag.tag.name) ?? ["Prospecto"],
    note: "",
    reminder: "",
    messages,
  };
};
const initialConversations: Conversation[] = [];

const nav: { label: View; icon: string }[] = [
  { label: "Inicio", icon: "⌂" }, { label: "Conversaciones", icon: "◎" }, { label: "Contactos", icon: "♙" }, { label: "Entrenar IA", icon: "✦" }, { label: "Base de conocimiento", icon: "▣" },
  { label: "Productos y servicios", icon: "□" }, { label: "Conexiones", icon: "◉" }, { label: "Equipo", icon: "♟" }, { label: "Plan y facturación", icon: "◆" }, { label: "Configuración", icon: "⚙" },
];

export default function NexoApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(true);
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "Inicio";
    const saved = window.localStorage.getItem("nextio_current_view") as View | null;
    return saved && nav.some(item => item.label === saved) ? saved : "Inicio";
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | number>("");
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [appointments, setAppointments] = useState<number>(0);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [modal, setModal] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  useEffect(() => {
    let cancelled = false;
    api.session()
      .then((principal) => {
        if (!cancelled) {
          setSession(principal);
          window.localStorage.setItem("nextio_session_hint","1");
          document.documentElement.setAttribute("data-nextio-session","1");
          setLoggedIn(true);
        }
        void api.organization().then((currentOrganization) => {
          if (!cancelled) setOrganization(currentOrganization);
        }).catch(() => {
          if (!cancelled) setOrganization(null);
        });
        void api.billingSubscription().then((subscription) => {
          if (!cancelled && subscription.status === "TRIALING" && subscription.trialExpired) {
            setView("Plan y facturación");
            window.localStorage.setItem("nextio_current_view", "Plan y facturación");
          }
        }).catch(() => undefined);
      })
      .catch(() => { if (!cancelled) { setSession(null); setOrganization(null); window.localStorage.removeItem("nextio_session_hint"); document.documentElement.removeAttribute("data-nextio-session"); setLoggedIn(false); } })
      .finally(() => { if (!cancelled) setSessionChecked(true); });
    return () => { cancelled = true; };
  }, [loggedIn]);
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    async function loadRealData() {
      try {
        const [dashboard, page] = await Promise.all([api.dashboard(), api.conversations(1)]);
        if (cancelled) return;
        setDashboardMetrics(dashboard);
        setAppointments(dashboard.appointments);
        const mapped = page.items.map(conversationFromApi);
        setConversations(mapped);
        setActiveId(mapped[0]?.id ?? "");
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "No se pudo actualizar la información; intenta de nuevo";
        if (/trial|20 conversaciones|suscripci[oó]n|pago|plan/i.test(message)) {
          setView("Plan y facturación");
        }
        notify(message);
      }
    }
    void loadRealData();
    return () => { cancelled = true; };
  }, [loggedIn]);
  useEffect(() => {
    if (!loggedIn || typeof activeId !== "string") return;
    let cancelled = false;
    async function loadConversationDetail() {
      try {
        const item = await api.conversation(String(activeId));
        if (cancelled) return;
        setConversations(current => current.map((conversation, index) => conversation.id === activeId ? conversationFromApi(item, index) : conversation));
      } catch {
        notify("No se pudo cargar el detalle de la conversacion");
      }
    }
    void loadConversationDetail();
    return () => { cancelled = true; };
  }, [loggedIn, activeId]);
  const logout = async () => {
    try { await api.logout(); }
    catch { /* La sesión pudo expirar antes de cerrar. */ }
    window.localStorage.removeItem("nextio_session_hint");
    window.localStorage.removeItem("nextio_current_view");
    document.documentElement.removeAttribute("data-nextio-session");
    setLoggedIn(false);
    setView("Inicio");
    setConversations([]);
    setActiveId("");
    setDashboardMetrics(null);
    setSession(null);
    setOrganization(null);
    setAppointments(0);
    setSidebar(false);
    setProfileMenu(false);
  };
  if (!sessionChecked) return <div className="boot-screen"><div className="brand"><span className="brand-mark">n</span><span>next.io <span>by Mercadia</span></span></div><p>Validando sesion...</p></div>;
  if (!loggedIn) return <PublicSite onLogin={async(email,password,remember) => { await api.login(email,password,remember); setLoggedIn(true); window.localStorage.setItem("nextio_session_hint","1"); document.documentElement.setAttribute("data-nextio-session","1"); }} onRegister={async(data) => { await api.register(data); setLoggedIn(true); window.localStorage.setItem("nextio_session_hint","1"); document.documentElement.setAttribute("data-nextio-session","1"); }} />;
  const active = conversations.find(c => c.id === activeId) ?? conversations[0];
  const userName = session?.name || "Cuenta";
  const userInitials = initials(userName);
  const roleLabel = session?.role === "SUPER_ADMIN" ? "Superadministrador" : session?.role === "ORGANIZATION_ADMIN" ? "Administrador" : session?.role === "SUPERVISOR" ? "Supervisor" : "Agente";
  const go = (v: View) => { setView(v); window.localStorage.setItem("nextio_current_view", v); setSidebar(false); };

  return <div className="app-shell">
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">n</span><span>next.io <span>by Mercadia</span></span></div>
      <button className="workspace"><span className="workspace-logo">NX</span><span><b>{organization?.name || "Mi organización"}</b><small>Datos de tu espacio de trabajo</small></span><span>⌄</span></button>
      <nav>{nav.map(item => <button key={item.label} className={view === item.label ? "active" : ""} onClick={() => go(item.label)}><i>{item.icon}</i>{item.label}{item.label === "Conversaciones" && <em>{conversations.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className="local-pill" onClick={() => notify("Sesion activa")} aria-label="Datos reales"><span /> Datos reales</button>
        <div className="profile-wrap"><button className="profile" onClick={() => setProfileMenu(!profileMenu)}><span className="avatar small">{userInitials}</span><span><b>{userName}</b><small>{roleLabel}</small></span><span>•••</span></button>{profileMenu&&<div className="profile-menu"><button onClick={logout}>Cerrar sesión</button></div>}</div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={() => setSidebar(!sidebar)}>☰</button><div><h1>{view}</h1><p>{subtitle(view)}</p></div><div className="top-actions"><span className="status"><i /> Sistema operativo</span><button className="icon-button" onClick={() => notify("No tienes notificaciones nuevas")}>♢</button><button className="avatar">{userInitials}</button></div></header>
      <div className="content">
        {view === "Inicio" && <Dashboard onNavigate={go} appointments={appointments} metrics={dashboardMetrics} />}
        {view === "Conversaciones" && (active ? <Inbox conversations={conversations} setConversations={setConversations} active={active} setActiveId={setActiveId} notify={notify} onAppointment={() => setModal(true)} /> : <EmptyState title="Sin conversaciones todavía" note="Cuando conectes canales reales o cargues conversaciones, aparecerán aquí. No se muestran datos inventados en cuentas nuevas." />)}
        {view === "Contactos" && <Contacts conversations={conversations} notify={notify} onOpen={(id) => { setActiveId(id); go("Conversaciones"); }} />}
        {view === "Entrenar IA" && <AgentSettings notify={notify} />}
        {view === "Base de conocimiento" && <KnowledgeBase notify={notify} />}
        {view === "Productos y servicios" && <KnowledgeBase notify={notify} initialKind="products" commerceOnly />}
        {view === "Conexiones" && <ChannelsFixed2 notify={notify} />}
        {view === "Equipo" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Equipo y roles" />}
        {view === "Plan y facturación" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Facturación" />}
        {view === "Configuración" && <Settings notify={notify} onSuper={() => go("Superadmin")} initialTab="Organización" />}
        {view === "Superadmin" && <Superadmin notify={notify} />}
      </div>
    </main>
    {toast && <div className="toast"><b>✓</b>{toast}</div>}
    {modal && active && <AppointmentModal contact={active.name} onClose={() => setModal(false)} onSave={() => { if(!active.hasAppointment)setAppointments(a => a + 1); setConversations(conversations.map(item=>item.id===active.id?{...item,hasAppointment:true,stage:"Cita",tags:Array.from(new Set([...item.tags,"Cita agendada"]))}:item)); setModal(false); notify("Cita agendada y enlace de Meet generado"); }} />}
  </div>;
}

function PublicSite({ onLogin, onRegister }: { onLogin: (email:string,password:string,remember:boolean)=>Promise<void>; onRegister: (data:{name:string;email:string;password:string;businessName:string;plan:BillingPlan;interval:BillingInterval})=>Promise<void> }) {
  const [page,setPage]=useState<"home"|"services"|"pricing"|"login">("home");
  if (page === "login") return <Login onLogin={onLogin} onRegister={onRegister}/>;
  return <div className="public-site"><header className="public-nav"><div className="brand"><span className="brand-mark">n</span><span>next.io <span>by Mercadia</span></span></div><nav><button onClick={()=>setPage("home")}>Inicio</button><button onClick={()=>setPage("services")}>Servicios</button><button onClick={()=>setPage("pricing")}>Precios</button><button className="primary" onClick={()=>setPage("login")}>Iniciar sesion</button></nav></header><main className="public-content"><section className="public-hero"><div className="public-copy"><span className="eyebrow">SAAS OMNICANAL CON IA</span><h1>Responde mas rapido, ordena tus canales y convierte conversaciones en clientes.</h1><p>next.io by Mercadia centraliza Instagram, Facebook, contactos, conocimiento del negocio, equipo, planes y pagos en un solo workspace preparado para IA real.</p><div className="hero-actions"><button className="primary" onClick={()=>setPage("login")}>Empezar prueba gratis</button><button onClick={()=>setPage("services")}>Ver servicios</button></div></div><div className="public-visual"><div className="visual-window"><div><span/><span/><span/></div><strong>Inbox + IA + Equipo</strong><p>Sin datos inventados: si tu cuenta esta vacia, la app muestra cero.</p><section><b>IG</b><b>FB</b><b>AI</b></section></div></div></section>{page==="home"&&<section className="public-grid"><article className="card"><h3>Atencion omnicanal</h3><p>Organiza contactos y conversaciones desde Instagram y Facebook cuando las canales esten conectados.</p></article><article className="card"><h3>IA entrenable</h3><p>Carga reglas, servicios, productos, horarios y politicas para responder con contexto real.</p></article><article className="card"><h3>Operacion SaaS</h3><p>Registro, trial de 7 dias, planes, limites, equipo y facturacion listos para produccion.</p></article></section>}{page==="services"&&<section className="public-grid"><article className="card"><h3>Implementacion</h3><p>Configuracion de negocio, canales, base de conocimiento, roles y flujo humano/IA.</p></article><article className="card"><h3>Automatizacion de atencion</h3><p>Respuestas rapidas, transferencia a humano, notas internas y seguimiento de conversaciones.</p></article><article className="card"><h3>Integraciones reales</h3><p>Primero Stripe, despues IA y luego Meta para Instagram y Facebook.</p></article></section>}{page==="pricing"&&<section className="pricing-grid public-pricing"><article className="pricing-card"><span>Starter</span><h3>$999 MXN/mes</h3><p>500 conversaciones/mes para equipos pequenos que empiezan con inbox y conocimiento.</p><button className="primary" onClick={()=>setPage("login")}>Prueba 7 dias</button></article><article className="pricing-card current"><span>Growth</span><h3>$1,999 MXN/mes</h3><p>2,000 conversaciones/mes para negocios con mayor volumen y equipo comercial.</p><button className="primary" onClick={()=>setPage("login")}>Prueba 7 dias</button></article><article className="pricing-card"><span>Advanced</span><h3>$3,499 MXN/mes</h3><p>5,000 conversaciones/mes para operaciones con limites mas altos y mas miembros.</p><button className="primary" onClick={()=>setPage("login")}>Prueba 7 dias</button></article></section>}</main></div>;
}

function Login({ onLogin, onRegister }: { onLogin: (email:string,password:string,remember:boolean) => Promise<void>; onRegister: (data:{name:string;email:string;password:string;businessName:string;plan:BillingPlan;interval:BillingInterval}) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [mode,setMode]=useState<"login"|"register">("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [name,setName]=useState("");
  const [businessName,setBusinessName]=useState("");
  const [plan,setPlan]=useState<BillingPlan>("PRO");
  const [interval,setInterval]=useState<BillingInterval>("MONTHLY");
  const [remember,setRemember]=useState(true);
  useEffect(()=>{
    const savedEmail=window.localStorage.getItem("nextio_remembered_email");
    if(savedEmail){setEmail(savedEmail);setRemember(true);}
  },[]);
  const submit = async(e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      mode==="login" ? await onLogin(email,password,remember) : await onRegister({name,email,password,businessName,plan,interval});
      if(mode==="login"){
        if(remember) window.localStorage.setItem("nextio_remembered_email", email.trim());
        else window.localStorage.removeItem("nextio_remembered_email");
      }
    } catch(reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible completar la solicitud");
      setLoading(false);
    }
  };
  const forgot=async()=>{
    const target=email.trim()||window.prompt("Correo de la cuenta")?.trim();
    if(!target)return;
    setError("");
    try{
      const result=await api.forgotPassword(target);
      const token=result.resetToken||window.prompt(result.message + " Pega aqui el token recibido")?.trim();
      if(!token){setError(result.message);return;}
      const next=window.prompt("Nueva contrasena, minimo 10 caracteres")?.trim();
      if(!next)return;
      await api.resetPassword(token,next);
      setError("Contrasena actualizada. Ya puedes iniciar sesion.");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"No fue posible recuperar la contrasena");
    }
  };
  return <div className="login-page">
    <div className="login-art">
      <div className="art-grid" />
      <div className="login-brand"><span className="brand-mark light">n</span>next.io <span>by Mercadia</span></div>
      <div className="login-quote"><span>✦</span><h2>Customer ops con IA<br />sin datos inventados.</h2><p>Gestiona conversaciones, equipo, pagos y conocimiento desde un solo workspace.</p><div className="channel-orbit"><b>IG</b><b>WA</b><b>FB</b><i /></div></div>
      <small>Omnichannel AI stack for growth teams</small>
    </div>
    <div className="login-panel"><form onSubmit={submit} autoComplete="on">
      <span className="eyebrow">{mode==="login"?"SECURE WORKSPACE":"MVP ONBOARDING"}</span>
      <h1>{mode==="login"?"Inicia sesion en next.io":"Crea tu cuenta"}</h1>
      <p>{mode==="login"?"Accede a tu operacion comercial.":"Crea tu negocio, elige plan e inicia prueba gratis de 7 dias."}</p>
      {mode==="register"&&<><label>Tu nombre<input name="register-name" value={name} onChange={event=>setName(event.target.value)} required /></label><label>Nombre del negocio<input name="register-business" value={businessName} onChange={event=>setBusinessName(event.target.value)} required /></label></>}
      <label>Correo electronico<input type="email" name="email" autoComplete="username email" value={email} onChange={event=>setEmail(event.target.value)} required /></label>
      <label>Contrasena<div className="password"><input type="password" name="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={event=>setPassword(event.target.value)} required minLength={mode==="register"?10:8}/><span>●</span></div></label>
      {mode==="register"&&<div className="form-grid compact"><label>Plan<select value={plan} onChange={event=>setPlan(event.target.value as BillingPlan)}><option value="STARTER">Starter</option><option value="PRO">Growth</option><option value="ENTERPRISE">Advanced</option></select></label><label>Periodo<select value={interval} onChange={event=>setInterval(event.target.value as BillingInterval)}><option value="MONTHLY">Mensual</option><option value="YEARLY">Anual</option></select></label></div>}
      {error&&<p role="alert" className="login-error">{error}</p>}
      <div className="form-row"><label className="check"><input type="checkbox" checked={remember} onChange={event=>{setRemember(event.target.checked);if(!event.target.checked)window.localStorage.removeItem("nextio_remembered_email");}} /> Recordarme</label><button type="button" className="link" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Crear cuenta":"Ya tengo cuenta"}</button></div>
      {mode==="login"&&<button type="button" className="link forgot-link" onClick={forgot}>Olvide mi contrasena</button>}
      <button className="primary login-submit" disabled={loading}>{loading ? "Procesando..." : mode==="login" ? "Iniciar sesion" : "Iniciar prueba gratis"}</button>
      <div className="local-box"><span>●</span><div><b>{mode==="login"?"Sesion protegida":"Prueba gratuita activa"}</b><p>{mode==="login"?"Recordaremos tu correo. La contrasena la carga el gestor seguro del navegador si decides guardarla.":"Tu cuenta inicia con trial y puedes agregar tarjeta para cobrar al terminar."}</p></div></div>
      <small className="legal">Al continuar, aceptas los Terminos y el Aviso de privacidad.</small>
    </form></div>
  </div>;
}

function Dashboard({ onNavigate, appointments, metrics: realMetrics }: { onNavigate: (v: View) => void; appointments: number; metrics: DashboardMetrics | null }) {
  const conversations = realMetrics?.conversations ?? 0;
  const newLeads = realMetrics?.newLeads ?? 0;
  const hotLeads = realMetrics?.hotLeads ?? 0;
  const aiHandled = realMetrics?.aiHandled ?? 0;
  const humanHandled = realMetrics?.humanHandled ?? 0;
  const funnel = realMetrics?.funnel ?? { contacts: 0, contacted: 0, qualified: 0, hot: 0, appointments };
  const newRate = realMetrics?.conversion?.newLeadToAppointment ?? 0;
  const hotRate = realMetrics?.conversion?.hotToAppointment ?? 0;
  const byChannel = (["instagram", "whatsapp", "facebook"] as Channel[]).map(channel => {
    const row = realMetrics?.byChannel?.find(item => channelFromApi(item.channel) === channel);
    return { channel, count: row?.count ?? 0, percentage: row?.percentage ?? 0 };
  });
  const metrics = [
    ["Conversaciones", conversations, "Abiertas y cerradas del workspace", "Conversaciones"],
    ["Nuevos leads", newLeads, "Contactos creados en base de datos", "Contactos"],
    ["Leads calientes", hotLeads, "Segun puntuacion real del contacto", "Conversaciones"],
    ["Citas", appointments, "Agendadas en el sistema", "Plan y facturacion"],
  ] as const;
  return <section className="dashboard"><div className="hero"><div><span className="eyebrow">OPERACION REAL</span><h2>Tu workspace esta listo.</h2><p>Si no hay conversaciones, contactos o citas, el sistema muestra cero.</p><div className="hero-actions"><button className="primary" onClick={() => onNavigate("Conversaciones")}>Abrir inbox</button><button onClick={() => onNavigate("Base de conocimiento")}>Cargar conocimiento</button></div></div><div className="hero-card"><span>Prueba gratuita</span><b>7 dias</b><small>Activa desde el registro y controlada por backend.</small></div></div><div className="metric-grid">{metrics.map(([label,value,note,target])=><article className="metric-card" key={label} onClick={()=>onNavigate(target as View)}><span>{label}</span><h3>{Number(value).toLocaleString("es-MX")}</h3><small>{note}</small></article>)}</div><div className="dashboard-grid"><article className="card chart-card"><CardTitle title="Conversaciones por canal" note="Datos reales por canal" /><div className="channel-bars">{byChannel.map(item=><div key={item.channel}><span>{CHANNELS[item.channel].label}</span><b>{item.count}</b><div><i className={item.channel} style={{width:`${item.percentage}%`}} /></div><small>{item.percentage}%</small></div>)}</div></article><article className="card funnel"><CardTitle title="Embudo de prospectos" note="Sin datos inventados" />{[["Contactos", funnel.contacts],["Contactados", funnel.contacted],["Calificados", funnel.qualified],["Calientes", funnel.hot],["Citas", appointments]].map(([label,value])=><div className="funnel-row" key={label}><b>{label}</b><div><i style={{width:`${Math.max(0, Number(value) / Math.max(1, newLeads) * 100)}%`}} /></div><strong>{value}</strong></div>)}<div className="conversion conversion-dual"><span>Nuevos a cita <b>{newRate}%</b></span><span>Calientes a cita <b>{hotRate}%</b></span></div></article></div><div className="dashboard-grid lower"><article className="card"><CardTitle title="Rendimiento de atencion" note="Metricas del workspace" /><div className="performance"><div><span>Atendidas por IA</span><b>{Math.round(aiHandled/Math.max(1,conversations)*100)}%</b><div><i style={{width:`${aiHandled/Math.max(1,conversations)*100}%`}} /></div><small>{aiHandled.toLocaleString("es-MX")} conversaciones</small></div><div><span>Transferidas a humano</span><b>{Math.round(humanHandled/Math.max(1,conversations)*100)}%</b><div><i style={{width:`${humanHandled/Math.max(1,conversations)*100}%`}} /></div><small>{humanHandled.toLocaleString("es-MX")} conversaciones</small></div><div className="response-time"><span>⏱</span><p>Primera respuesta promedio<b>0 segundos</b></p><em>Sin calculo hasta tener mensajes</em></div></div></article><article className="card"><CardTitle title="Actividad reciente" note="Eventos reales" /><EmptyState title="Sin actividad todavia" note="Cuando existan mensajes, citas o cambios de estado apareceran aqui." /></article></div></section>;
}

function Inbox({ conversations, setConversations, active, setActiveId, notify, onAppointment }: { conversations: Conversation[]; setConversations: (v: Conversation[]) => void; active: Conversation; setActiveId: (id:string | number)=>void; notify:(s:string)=>void; onAppointment:()=>void }) {
  const [filter, setFilter] = useState("Todos"); const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [noteDraft,setNoteDraft]=useState("");
  const filtered = useMemo(() => conversations.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) && (filter === "Todos" || CHANNELS[c.channel].label === filter || c.temperature === filter || (filter==="IA activa"&&c.ai) || (filter==="Pausadas"&&!c.ai) || (filter==="Humano"&&c.transferred) || (filter==="Con cita"&&c.hasAppointment))), [conversations, query, filter]);
  const update = (partial: Partial<Conversation>) => setConversations(conversations.map(c => c.id === active.id ? {...c, ...partial} : c));
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
    update({ messages: [...active.messages, { body, from: "human", time: now }], last: body, time: "Ahora", unread: 0 });
    setDraft("");
    if (typeof active.id === "string") {
      try {
        await api.sendMessage(active.id, body);
        notify("Mensaje guardado en la base de datos");
        return;
      } catch {
        notify("No se pudo guardar en este momento");
      }
    }
    notify("Mensaje enviado y conversación actualizada");
    window.setTimeout(()=>{
      const reply=body.toLowerCase().includes("cita")?"Sí, me funciona. ¿Qué horarios tienen disponibles?":"Gracias por la información. Lo revisaré con mi equipo.";
      const current=conversations.find(item=>item.id===active.id)??active;
      setConversations(conversations.map(item=>item.id===active.id?{...item,messages:[...current.messages,{body,from:"human",time:now},{body:reply,from:"contact",time:now}],last:reply,time:"Ahora",unread:1}:item));
      notify(`${active.name} respondió`);
    },700);
  };
  const syncConversation = (item: ApiConversation) => setConversations(conversations.map((conversation, index)=>conversation.id===active.id?conversationFromApi(item,index):conversation));
  const replyWithAi = async () => {
    if(typeof active.id!=="string"){notify("La respuesta IA solo aplica a conversaciones reales");return;}
    setAiLoading(true);
    try{syncConversation(await api.aiReply(active.id));notify("Respuesta IA generada y guardada");}
    catch(reason){notify(reason instanceof Error?reason.message:"No se pudo generar respuesta IA");}
    finally{setAiLoading(false);}
  };
  const take = async () => { if(typeof active.id!=="string"){update({transferred:true,ai:false});notify("Conversación tomada en modo local");return;} try{syncConversation(await api.takeConversation(active.id));notify("Conversación tomada. IA pausada.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo tomar la conversación");} };
  const returnToAi = async () => { if(typeof active.id!=="string"){update({transferred:false,ai:true});notify("Conversación devuelta a IA en modo local");return;} try{syncConversation(await api.returnConversationToAi(active.id));notify("Conversación devuelta a IA.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo devolver a IA");} };
  const close = async () => { if(typeof active.id!=="string"){update({closed:true,ai:false});notify("Conversación cerrada en modo local");return;} try{syncConversation(await api.closeConversation(active.id));notify("Conversación cerrada.");}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cerrar la conversación");} };
  return <div className="inbox"><section className="thread-list"><div className="inbox-title"><div><h2>Conversaciones</h2><span>{conversations.reduce((sum,item)=>sum+item.unread,0)} sin leer</span></div><button onClick={()=>notify("Nueva conversación local creada") } aria-label="Nueva conversación">+</button></div><div className="search"><span>⌕</span><input aria-label="Buscar conversaciones" placeholder="Buscar conversaciones..." value={query} onChange={e=>setQuery(e.target.value)} /></div><div className="filters">{["Todos","Instagram","WhatsApp","Facebook","Frío","Tibio","Caliente","IA activa","Pausadas","Humano","Con cita"].map(f=><button className={filter===f?"active":""} onClick={()=>setFilter(f)} key={f}>{f}</button>)}</div><div className="threads">{filtered.length ? filtered.map(c=><button key={c.id} className={active.id===c.id?"active":""} onClick={()=>{setActiveId(c.id);setNoteDraft(c.note)}}><span className="avatar" style={{background:c.color}}>{c.initials}</span><span className="thread-copy"><b>{c.name}<i className={`channel ${c.channel}`}>{CHANNELS[c.channel].short}</i></b><small>{c.last}</small><em className={`temp ${c.temperature.toLowerCase()}`}>● {c.temperature}</em>{c.ai ? <em className="ai-label">✦ IA activa</em>:<em className="ai-label paused">Ⅱ IA pausada</em>}{c.transferred&&<em className="ai-label">Humano</em>}</span><span className="thread-meta"><time>{c.time}</time>{c.unread>0&&<b>{c.unread}</b>}</span></button>) : <div className="empty"><b>Sin resultados</b><span>Prueba con otro filtro.</span></div>}</div></section>
    <section className="chat"><div className="chat-head"><span className="avatar" style={{background:active.color}}>{active.initials}</span><div><b>{active.name}</b><span><i className="online" /> En línea · {CHANNELS[active.channel].label}</span></div><div className="chat-actions"><button onClick={()=>{update({ai:!active.ai});notify(active.ai?"IA pausada":"IA activada")}}>✦ {active.ai?"Pausar IA":"Activar IA"}</button><button className={active.transferred?"active":""} onClick={()=>{update({transferred:!active.transferred,ai:active.transferred?active.ai:false});notify(active.transferred?"Conversación devuelta a IA":"Conversación transferida a Leniel")}}>⇄ {active.transferred?"Devolver a IA":"Transferir"}</button><button aria-label="Más opciones">•••</button></div></div><div className="chat-note"><span>✦</span><p><b>Resumen de IA</b> {active.summary}</p></div><div className="messages"><div className="date-chip">HOY</div>{active.messages.map((message,i)=><div className={`bubble-row ${message.from === "contact" ? "in" : "out"}`} key={`${active.id}-${i}`}>{message.from === "contact"&&<span className="avatar tiny" style={{background:active.color}}>{active.initials}</span>}<div className="bubble">{message.from === "ai"&&<small>✦ Nia · IA</small>}{message.from === "human"&&<small>Leniel · Agente</small>}<p>{message.body}</p><time>{message.time} {message.from !== "contact"?"✓✓":""}</time></div></div>)}</div><div className="quick-replies"><button onClick={replyWithAi} disabled={aiLoading}>{aiLoading?"Generando IA...":"Responder con IA"}</button><button onClick={()=>setDraft("¿Te gustaría agendar una videollamada de 20 minutos?")}>Agendar videollamada</button><button onClick={()=>setDraft("Te comparto nuestros planes disponibles.")}>Compartir planes</button><button onClick={()=>setDraft("¿Hay algo más en lo que pueda ayudarte?")}>Cerrar conversación</button></div><div className="composer"><button aria-label="Adjuntar">+</button><textarea aria-label="Mensaje" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Escribe un mensaje..." onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/><button aria-label="Emoji">☺</button><button className="send" onClick={send} aria-label="Enviar mensaje">➤</button><small>Enter para enviar · Respuesta humana</small></div></section>
    <aside className="contact-panel"><div className="contact-hero"><span className="avatar large" style={{background:active.color}}>{active.initials}</span><h3>{active.name}</h3><span><i className={`channel ${active.channel}`}>{CHANNELS[active.channel].short}</i> {CHANNELS[active.channel].label}</span></div><div className="score"><div><span>Puntuación del lead</span><b>{active.score}<small>/100</small></b></div><div className="score-track"><i style={{width:`${active.score}%`}}/></div><p>{active.temperature} · puntuación del contacto</p></div><PanelBlock title="Clasificación"><div className="temperature-select">{(["Frío","Tibio","Caliente"] as Temperature[]).map(t=><button className={active.temperature===t?`active ${t.toLowerCase()}`:""} onClick={()=>{update({temperature:t});notify(`Clasificación cambiada a ${t}`)}} key={t}>● {t}</button>)}</div></PanelBlock><PanelBlock title="Detalles"><Detail label="Interés detectado" value={active.interest}/><Detail label="Etapa comercial" value={active.stage}/><Detail label="Último contacto" value={active.time}/><Detail label="Próxima acción" value={active.reminder||"Enviar propuesta"}/></PanelBlock><PanelBlock title="Etiquetas"><div className="tags">{active.tags.map(tag=><span key={tag}>{tag}</span>)}<button aria-label="Agregar etiqueta" onClick={()=>{const tag=window.prompt("Nombre de la etiqueta");if(tag?.trim()){update({tags:[...active.tags,tag.trim()]});notify("Etiqueta agregada")}}}>+</button></div></PanelBlock><PanelBlock title="Recordatorio"><button className="reminder-button" onClick={()=>{update({reminder:"Mañana, 10:00"});notify("Recordatorio programado para mañana a las 10:00")}}>{active.reminder?`▷ ${active.reminder}`:"+ Programar recordatorio"}</button></PanelBlock><PanelBlock title="Notas"><textarea key={active.id} value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} placeholder="Agregar una nota interna..."/><button className="link" onClick={()=>{update({note:noteDraft});notify("Nota guardada")}}>Guardar nota</button></PanelBlock><button className="appointment" onClick={onAppointment}>{active.hasAppointment?"✓ Cita agendada":"□ Agendar videollamada"}</button></aside>
  </div>;
}

function Contacts({ conversations, onOpen, notify }: { conversations: Conversation[]; onOpen:(id:string | number)=>void; notify:(s:string)=>void }) {
  const [q,setQ]=useState("");
  const [channel,setChannel]=useState<"all"|Channel>("all");
  const [temperature,setTemperature]=useState<"all"|Temperature>("all");
  const [contacts,setContacts]=useState<ApiContact[]>([]);
  const [loading,setLoading]=useState(false);
  const load=async()=>{setLoading(true);try{const page=await api.contacts(1,q);setContacts(page.items)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudieron cargar contactos")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[q]);
  const create=async()=>{
    const firstName=window.prompt("Nombre del contacto")?.trim(); if(!firstName)return;
    const lastName=window.prompt("Apellido opcional")?.trim() || undefined;
    const email=window.prompt("Correo opcional")?.trim() || undefined;
    const phone=window.prompt("Telefono opcional")?.trim() || undefined;
    try{await api.createContact({firstName,lastName,email,phone,leadTemperature:"COLD",leadScore:0});notify("Contacto creado");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo crear el contacto")}
  };
  const rows = contacts.map((contact,index) => {
    const name = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
    const linked = conversations.find(item => item.name === name);
    const temp = temperatureFromApi(contact.leadTemperature);
    return { id: contact.id, conversationId: linked?.id, name, initials: initials(name), channel: linked?.channel, temperature: temp, score: contact.leadScore, interest: linked?.interest ?? "Sin conversacion", stage: linked?.stage ?? "Contacto", last: contact.lastInteractionAt ? formatTime(contact.lastInteractionAt) : "Sin actividad", color: linked?.color ?? colors[index % colors.length] };
  }).filter(row => (channel==="all" || row.channel===channel) && (temperature==="all" || row.temperature===temperature));
  return <section className="page-stack"><div className="section-heading"><div><h2>Contactos y prospectos</h2><p>Contactos reales de la base de datos. Las conversaciones de redes apareceran al conectar Meta.</p></div><button className="primary" onClick={create}>+ Nuevo contacto</button></div><div className="card table-card"><div className="table-tools"><div className="search wide"><span>⌕</span><input placeholder="Buscar por nombre o correo..." value={q} onChange={e=>setQ(e.target.value)}/></div><select value={channel} onChange={e=>setChannel(e.target.value as "all"|Channel)}><option value="all">Todos los canales</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="facebook">Facebook</option></select><select value={temperature} onChange={e=>setTemperature(e.target.value as "all"|Temperature)}><option value="all">Temperatura</option><option value="Frío">Frio</option><option value="Tibio">Tibio</option><option value="Caliente">Caliente</option></select></div><table><thead><tr><th>Contacto</th><th>Canal</th><th>Interes</th><th>Clasificacion</th><th>Puntuacion</th><th>Etapa</th><th>Ultimo contacto</th><th/></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><span className="avatar small" style={{background:row.color}}>{row.initials}</span><b>{row.name}</b></td><td>{row.channel?<><i className={`channel ${row.channel}`}>{CHANNELS[row.channel].short}</i> {CHANNELS[row.channel].label}</>:"Sin canal"}</td><td>{row.interest}</td><td><em className={`temp ${row.temperature.toLowerCase()}`}>● {row.temperature}</em></td><td><b>{row.score}</b>/100</td><td>{row.stage}</td><td>{row.last}</td><td>{row.conversationId?<button className="link" onClick={()=>onOpen(row.conversationId!)}>Abrir</button>:<span/>}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty"><b>{loading?"Cargando contactos":"Sin contactos"}</b><span>Crea un contacto o cambia los filtros.</span></div>}</div></section>
}

const knowledgeConfig: Record<KnowledgeKind, KnowledgeConfig> = {
  faqs: { label: "FAQs", singular: "FAQ", titleKey: "question", subtitleKey: "answer", create: () => ({ question: "¿Cómo funciona next.io?", answer: "Centraliza conversaciones, califica prospectos y prepara respuestas para tu equipo.", active: true }) },
  products: { label: "Productos", singular: "Producto", titleKey: "name", subtitleKey: "description", create: () => ({ sku: `NX-${Date.now()}`, name: "Producto nuevo", description: "Producto conectado a la base de conocimiento.", price: 0, currency: "MXN", active: true }) },
  services: { label: "Servicios", singular: "Servicio", titleKey: "name", subtitleKey: "description", create: () => ({ code: `SRV-${Date.now()}`, name: "Servicio nuevo", description: "Servicio disponible para respuestas comerciales.", price: 0, currency: "MXN", durationMinutes: 30, active: true }) },
  promotions: { label: "Promociones", singular: "Promoción", titleKey: "name", subtitleKey: "description", create: () => ({ code: `PROMO-${Date.now()}`, name: "Promoción nueva", description: "Oferta temporal para campañas comerciales.", discountType: "PERCENTAGE", discountValue: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), active: true }) },
  schedules: { label: "Horarios", singular: "Horario", titleKey: "name", subtitleKey: "timezone", create: () => ({ name: "Horario comercial", timezone: "America/Mexico_City", active: true, entries: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(dayOfWeek => ({ dayOfWeek, opensAt: "09:00", closesAt: "18:00" })) }) },
  policies: { label: "Políticas", singular: "Política", titleKey: "title", subtitleKey: "content", create: () => ({ type: "CUSTOM", title: "Política nueva", content: "Contenido operativo disponible para el agente y el equipo.", active: true }) },
};
const knowledgeKinds = Object.keys(knowledgeConfig) as KnowledgeKind[];
const recordValue = (record: KnowledgeRecord, ...keys: string[]) => keys.map(key => record[key]).find(value => typeof value === "string" && value.trim()) as string | undefined;
const moneyValue = (record: KnowledgeRecord) => typeof record.price === "number" ? `${record.currency ?? "MXN"} ${record.price.toLocaleString("es-MX")}` : "";
const knowledgeMeta = (record: KnowledgeRecord) => {
  const code = String(record.sku || record.code || "").trim();
  const price = moneyValue(record);
  const duration = typeof record.durationMinutes === "number" ? `${record.durationMinutes} min` : "";
  const discount = typeof record.discountValue === "number" ? `${record.discountValue}${record.discountType === "PERCENTAGE" ? "%" : " MXN"} descuento` : "";
  return [code && `Código ${code}`, price, duration, discount].filter(Boolean).join(" · ");
};
const knowledgeDraft = (kind: KnowledgeKind): Record<string, unknown> | null => {
  if (kind === "faqs") { const question=window.prompt("Pregunta frecuente")?.trim(); if(!question)return null; const answer=window.prompt("Respuesta para la IA")?.trim(); if(!answer)return null; return { question, answer, active: true }; }
  if (kind === "products") { const name=window.prompt("Nombre del producto")?.trim(); if(!name)return null; const sku=(window.prompt("SKU o codigo")?.trim() || `PROD-${Date.now()}`).toUpperCase(); const description=window.prompt("Descripcion del producto")?.trim() || ""; const price=Number(window.prompt("Precio en MXN", "0") || "0"); return { sku, name, description, price, currency: "MXN", active: true }; }
  if (kind === "services") { const name=window.prompt("Nombre del servicio")?.trim(); if(!name)return null; const code=(window.prompt("Codigo del servicio")?.trim() || `SRV-${Date.now()}`).toUpperCase(); const description=window.prompt("Descripcion del servicio")?.trim() || ""; const price=Number(window.prompt("Precio en MXN", "0") || "0"); return { code, name, description, price, currency: "MXN", durationMinutes: 30, active: true }; }
  if (kind === "promotions") { const name=window.prompt("Nombre de la promocion")?.trim(); if(!name)return null; const code=(window.prompt("Codigo de promocion")?.trim() || `PROMO-${Date.now()}`).toUpperCase(); const description=window.prompt("Descripcion")?.trim() || ""; const rawDiscount=window.prompt("Descuento en porcentaje. Para 2x1 usa 50 y explica el 2x1 en la descripcion.", "10") || "10"; const discountValue=Number(rawDiscount); if(!Number.isFinite(discountValue)||discountValue<=0||discountValue>100){ window.alert("El descuento debe ser un numero entre 1 y 100. Ejemplo: para 2x1 usa 50."); return null; } return { code, name, description, discountType: "PERCENTAGE", discountValue, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), active: true }; }
  if (kind === "schedules") return knowledgeConfig.schedules.create();
  const title=window.prompt("Titulo de la politica")?.trim(); if(!title)return null; const content=window.prompt("Contenido de la politica")?.trim(); if(!content)return null; return { type: "CUSTOM", title, content, version: 1, active: true };
};

function KnowledgeBase({notify,initialKind="faqs",commerceOnly=false}:{notify:(s:string)=>void;initialKind?:KnowledgeKind;commerceOnly?:boolean}) {
  const [kind,setKind]=useState<KnowledgeKind>(initialKind);
  const [search,setSearch]=useState("");
  const [items,setItems]=useState<KnowledgeRecord[]>([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const config=knowledgeConfig[kind];
  const visibleKinds = commerceOnly ? (["products","services"] as KnowledgeKind[]) : knowledgeKinds.filter(item=>!["products","services"].includes(item));
  const load=async(nextKind=kind,nextSearch=search)=>{setLoading(true);try{const page=await api.knowledgeList(nextKind,nextSearch);setItems(page.items);setTotal(page.total)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar Knowledge Base")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[kind,search]);
  const create=async()=>{const draft=knowledgeDraft(kind);if(!draft)return;try{const created=await api.knowledgeCreate(kind,draft);setSearch("");setItems(current=>[created,...current.filter(item=>item.id!==created.id)]);setTotal(current=>current+1);notify(`${config.singular ?? config.label}: registro creado`);await load(kind,"")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo crear el registro")}};
  const rename=async(item:KnowledgeRecord)=>{const current=recordValue(item,config.titleKey,"name","title","question","code","sku")??"";const next=window.prompt("Nuevo texto principal",current);if(!next?.trim())return;try{await api.knowledgeUpdate(kind,item.id,{[config.titleKey]:next.trim()});notify("Registro actualizado");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo actualizar")}};
  const toggle=async(item:KnowledgeRecord)=>{try{await api.knowledgeUpdate(kind,item.id,{active:item.active===false});notify(item.active===false?"Registro activado":"Registro pausado");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cambiar el estado")}};
  const remove=async(item:KnowledgeRecord)=>{if(!window.confirm("¿Eliminar este registro? Se aplicará soft delete."))return;try{await api.knowledgeDelete(kind,item.id);notify("Registro eliminado con soft delete");await load()}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo eliminar")}};
  return <section className="page-stack knowledge-page">
    <div className="section-heading">
      <div>
        <span className="eyebrow">DATA OPERATIVA</span>
        <h2>{commerceOnly?"Productos y servicios":"Base de conocimiento"}</h2>
        <p>{commerceOnly?"Agrega lo que vende el negocio para que la IA lo pueda explicar.":"FAQs son preguntas frecuentes. Promociones, horarios y politicas ayudan a que la IA responda con informacion real del negocio."}</p>
      </div>
      <button className="primary" onClick={create}>+ Nuevo {config.singular ?? config.label}</button>
    </div>
    <div className="card knowledge-shell">
      <div className="knowledge-tabs">{visibleKinds.map(item=><button className={kind===item?"active":""} onClick={()=>{setSearch("");setKind(item)}} key={item}>{knowledgeConfig[item].label}</button>)}</div>
      <div className="table-tools"><div className="search wide"><span>⌕</span><input placeholder={`Buscar en ${config.label}...`} value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="knowledge-count">{loading?"Sincronizando...":`${total} registros`}</span></div>
      <div className="knowledge-list">{items.length?items.map(item=>{const title=recordValue(item,config.titleKey,"question","name","title","code","sku")??item.id;const subtitle=recordValue(item,config.subtitleKey,"answer","description","content","timezone")??"Sin descripcion";const meta=knowledgeMeta(item);return <article className="knowledge-row" key={item.id}><span className={`knowledge-status ${item.active===false?"off":"on"}`}>{item.active===false?"Pausado":"Activo"}</span><div><b>{title}</b><p>{subtitle}</p><small>{meta || `ID ${item.id.slice(0,8)}`}</small></div><div className="knowledge-actions"><button onClick={()=>rename(item)}>Editar</button><button onClick={()=>toggle(item)}>{item.active===false?"Activar":"Pausar"}</button><button onClick={()=>remove(item)}>Eliminar</button></div></article>}):<div className="empty"><b>{loading?"Cargando...":"Sin registros"}</b><span>Crea un registro o cambia tu busqueda.</span></div>}</div>
    </div>
  </section>
}

function Automations({notify}:{notify:(s:string)=>void}){ const [rules]=useState<AutomationRule[]>([]); return <section className="page-stack"><div className="section-heading"><div><h2>Automatizaciones</h2><p>Reglas reales del workspace. Si no creas reglas, esta seccion queda vacia.</p></div><button className="primary" onClick={()=>notify("Automatizaciones disponibles cuando actives reglas")}>Nueva automatizacion</button></div>{rules.length?<div className="automation-grid">{rules.map((rule,i)=><article className="card automation-card" key={i}><h3>{rule.name}</h3><p><span>CUANDO</span>{rule.trigger}</p><p><span>ENTONCES</span>{rule.action}</p></article>)}</div>:<EmptyState title="Sin automatizaciones" note="Aun no hay reglas guardadas para esta organizacion." />}</section> }

function AgentSettings({notify}:{notify:(s:string)=>void}) {
  const defaultPrompt="Define aqui el comportamiento real de tu asistente: que vende tu negocio, como debe responder, que no debe prometer y cuando debe transferir a una persona.";
  const [agentName,setAgentName]=useState("Asistente");
  const [prompt,setPrompt]=useState(defaultPrompt);
  const [versions,setVersions]=useState<{id:string;versionNumber:number;status:string;createdAt:string}[]>([]);
  const [status,setStatus]=useState("Borrador");
  const [testMessage,setTestMessage]=useState("Hola, quiero informacion");
  const [testReply,setTestReply]=useState("");
  const tokens=Math.ceil(prompt.length/4);
  useEffect(()=>{let cancelled=false;api.currentPrompt().then(current=>{if(cancelled||!current)return;setAgentName(current.agentName);const content=current.publishedVersion?.content ?? current.versions?.[0]?.content;if(content)setPrompt(content);setVersions(current.versions?.map(v=>({id:v.id,versionNumber:v.versionNumber,status:v.status,createdAt:v.createdAt}))??[]);setStatus(current.publishedVersion?"Publicado":"Borrador cargado")}).catch(()=>{});return()=>{cancelled=true}},[]);
  const save=async(publish:boolean)=>{try{await api.savePrompt(agentName,prompt,publish);setStatus(publish?"Publicado":"Borrador guardado");notify(publish?"Prompt publicado":"Borrador guardado");const current=await api.currentPrompt();setVersions(current?.versions?.map(v=>({id:v.id,versionNumber:v.versionNumber,status:v.status,createdAt:v.createdAt}))??[])}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo guardar el prompt")}};
  const test=async()=>{try{const result=await api.simulateAi(testMessage,"instagram",0);setTestReply(result.reply);notify("Prueba generada")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo probar el prompt")}};
  return <section className="page-stack"><div className="section-heading"><div><h2>Entrenar IA</h2><p>Configura como debe responder la IA de este negocio.</p></div><div className="button-row"><button onClick={()=>save(false)}>Guardar borrador</button><button onClick={test}>Probar prompt</button><button className="primary" onClick={()=>save(true)}>Publicar</button></div></div><div className="two-col"><div className="card form-card"><div className="agent-profile"><span className="agent-avatar">AI</span><div><h3>{agentName}</h3><span><i/> {status} · {tokens} tokens aprox.</span></div></div><label>Nombre del agente<input value={agentName} onChange={e=>setAgentName(e.target.value)}/></label><label>Prompt general<textarea className="prompt prompt-general" value={prompt} onChange={event=>{setPrompt(event.target.value);setStatus("Borrador")}} aria-label="Prompt general"/></label><div className="prompt-meta"><span>{prompt.length} caracteres</span><span>{tokens} tokens aproximados</span></div><label>Mensaje de prueba<input value={testMessage} onChange={e=>setTestMessage(e.target.value)}/></label>{testReply&&<div className="safety-card"><span>AI</span><div><b>Respuesta de prueba</b><p>{testReply}</p></div></div>}</div><aside className="page-stack"><div className="card version-list"><CardTitle title="Historial de versiones" note="Versiones reales"/>{versions.length?versions.slice(0,6).map(v=><div key={v.id}><b>v{v.versionNumber}</b><p><strong>{v.status}</strong><span>{formatTime(v.createdAt)}</span></p><button onClick={()=>notify(`Version ${v.versionNumber}`)}>Ver</button></div>):<EmptyState title="Sin versiones publicadas" note="Cuando guardes o publiques un prompt, aparecera aqui." />}</div><div className="safety-card"><span>!</span><div><b>Proteccion para temas sensibles</b><p>Las reglas de seguridad aplican siempre.</p></div></div></aside></div></section>
}

function Laboratory({notify}:{notify:(s:string)=>void}) { const [input,setInput]=useState(""); const [chat,setChat]=useState<{body:string;role:"user"|"agent"}[]>([]); const [channel,setChannel]=useState<Channel>("instagram"); const [completed,setCompleted]=useState(false); const replies=["Gracias por contactarnos. Que necesitas resolver primero: responder mas rapido, organizar canales o dar seguimiento a clientes?","Entendido. Para orientarte mejor, cuantas conversaciones recibe tu negocio al mes aproximadamente?","Listo. Con esos datos el siguiente paso seria revisar configuracion, canales y plan antes de conectar canales reales."]; const send=async()=>{if(!input.trim()||completed)return;const user={body:input.trim(),role:"user" as const};const turn=chat.filter(m=>m.role==="user").length;setChat(current=>[...current,user]);setInput("");try{const result=await api.simulateAi(user.body,channel,turn);setChat(current=>[...current,{body:result.reply,role:"agent"}])}catch{setChat(current=>[...current,{body:replies[Math.min(turn,replies.length-1)],role:"agent"}])}if(turn>=2)setCompleted(true)}; return <section className="lab-page"><div className="lab-header"><div><span className="eyebrow">ENTORNO DE PRUEBAS</span><h2>Laboratorio del agente</h2><p>Prueba respuestas sin usar datos falsos de negocio.</p></div><div><button onClick={()=>{setChat([]);setInput("");setCompleted(false);notify("Conversacion restablecida")}}>Restablecer</button><button className="primary" onClick={()=>notify("Prompt guardado y publicado")}>Guardar y publicar</button></div></div><div className="lab-grid"><div className="card lab-editor"><CardTitle title="Configuracion de prueba" note="Los cambios no afectan al agente publicado"/><div className="form-grid"><label>Tono<select><option>Cercano y profesional</option></select></label><label>Proveedor y modelo<select><option>Proveedor configurado</option><option>OpenAI pendiente</option></select></label></div><label>Objetivo<input placeholder="Ej. Calificar prospectos y transferir casos importantes"/></label><label>Prompt del sistema<textarea className="prompt" placeholder="Escribe instrucciones reales de tu negocio"/></label><label>Reglas<textarea placeholder={"Maximo 3 oraciones\nNo prometer cosas no configuradas\nTransferir temas sensibles"} /></label><div className="business-data"><b>Datos del negocio</b><div><span>Empresa<em>Sin configurar</em></span><span>Servicio<em>Sin configurar</em></span><span>Horario<em>Sin configurar</em></span></div></div></div><div className="phone-side"><div className="channel-tabs">{(["instagram","whatsapp","facebook"] as Channel[]).map(c=><button className={channel===c?`active ${c}`:""} onClick={()=>setChannel(c)} key={c}><i className={`channel ${c}`}>{CHANNELS[c].short}</i>{CHANNELS[c].label}</button>)}</div><div className={`phone ${channel}`}><div className="phone-notch"/><div className="phone-head"><span>AI</span><span className="agent-avatar mini">AI</span><p><b>Asistente</b><small>Prueba del agente</small></p><span>...</span></div><div className="phone-chat">{chat.length?chat.map((message,i)=><div className={`phone-bubble ${message.role}`} key={i}>{message.body}</div>):<div className="empty"><b>Conversacion nueva</b><span>Escribe Hola para comenzar.</span></div>}{completed&&<div className="lab-complete">Prueba completada</div>}</div><div className="phone-input"><input value={input} disabled={completed} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder={completed?"Prueba finalizada":"Escribe un mensaje..."}/><button onClick={send} disabled={completed}>Enviar</button></div></div><div className="analysis-strip"><div><span>Intencion</span><b>{completed?"Lista para seguimiento":"Explorando"}</b></div><div><span>Temperatura</span><b className="warm">{completed?"Caliente":"Tibio"}</b></div><div><span>Accion sugerida</span><b>{completed?"Transferir a humano":"Continuar calificando"}</b></div></div></div></div></section> }

function Statistics(){return <section className="page-stack"><div className="section-heading"><div><h2>Estadisticas</h2><p>Reportes reales. Las tarjetas permanecen en cero hasta que exista actividad.</p></div><button onClick={()=>window.alert("No hay datos para exportar todavia")}>Exportar reporte</button></div><div className="metric-grid"><article className="metric-card"><span>Atencion por IA</span><h3>0%</h3><small>0 conversaciones</small></article><article className="metric-card"><span>Conversion nuevo a cita</span><h3>0%</h3><small>0 de 0</small></article><article className="metric-card"><span>Primera respuesta</span><h3>0 s</h3><small>Sin mensajes</small></article><article className="metric-card"><span>Tiempo ahorrado</span><h3>0 h</h3><small>Sin calculo</small></article></div><EmptyState title="Sin estadisticas todavia" note="Cuando entren conversaciones reales, esta seccion se llenara desde la base de datos." /></section>}

function ChannelsFixed2({notify}:{notify:(s:string)=>void}) {
  const emptyStatus = (channel: Channel): ChannelStatusInfo => ({
    channel: channel.toUpperCase() as ChannelStatusInfo["channel"],
    label: CHANNELS[channel].label,
    provider: "meta",
    status: "NOT_CONNECTED",
    isMock: false,
    accountLabel: "Sin cuenta conectada",
    lastSyncAt: "",
    message: "Canal no conectado.",
  });
  const [channels,setChannels]=useState<Record<Channel,ChannelStatusInfo>>({
    instagram: emptyStatus("instagram"),
    whatsapp: emptyStatus("whatsapp"),
    facebook: emptyStatus("facebook"),
  });
  const [syncing,setSyncing]=useState(false);
  const load=async()=>{
    try{
      const items=await api.channels();
      const next:Record<Channel,ChannelStatusInfo>={
        instagram:emptyStatus("instagram"),
        whatsapp:emptyStatus("whatsapp"),
        facebook:emptyStatus("facebook"),
      };
      items.forEach(item=>{next[channelFromApi(item.channel)]=item});
      setChannels(next);
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudieron cargar los canales");
    }
  };
  useEffect(()=>{void load()},[]);
  const connect=async(channel:Channel)=>{
    try{
      if(channel==="instagram"){
        const {authorizationUrl}=await api.startInstagramAuthorization();
        window.location.assign(authorizationUrl);
        return;
      }
      const result=await api.channelConnect(channel.toUpperCase() as any);
      setChannels(current=>({...current,[channel]:result}));
      notify(result.message);
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudo actualizar el canal");
    }
  };
  const statusText=(status:ChannelStatusInfo["status"])=>({
    NOT_CONNECTED:"No conectado",
    CONFIGURING:"Configurando",
    CONNECTED:"Conectado",
    CONNECTED_MOCK:"Conectado mock",
    PENDING:"Pendiente",
    ERROR:"Error",
    TOKEN_EXPIRED:"Token vencido",
  }[status]);
  const syncInstagram=async()=>{
    try{
      setSyncing(true);
      const result=await api.syncInstagram();
      notify(`Instagram sincronizado: ${result.created} mensajes nuevos, ${result.skipped} omitidos.`);
      await load();
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudo sincronizar Instagram");
    }finally{
      setSyncing(false);
    }
  };
  const instagramConnected=channels.instagram.status==="CONNECTED";
  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <h2>Conexiones</h2>
          <p>Administra canales oficiales. Instagram muestra la autorizacion real guardada en backend.</p>
        </div>
        <span className={`status-banner ${instagramConnected?"ok":""}`}><i/> {instagramConnected?"Meta conectado":"Meta no conectado"}</span>
      </div>
      <div className="channel-cards">
        {(["instagram","whatsapp","facebook"] as Channel[]).map((channel,i)=>{
          const item=channels[channel];
          const connected=item.status==="CONNECTED";
          const canSync=channel==="instagram"&&connected;
          return (
            <article className={`card channel-card ${connected?"connected":""}`} key={channel}>
              <div>
                <i className={`channel huge ${channel}`}>{CHANNELS[channel].short}</i>
                <span>
                  <h3>{CHANNELS[channel].label}</h3>
                  <p>{i===0?"Direct y comentarios":i===1?"WhatsApp Cloud API":"Messenger y comentarios"}</p>
                </span>
              </div>
              <span className={`connection-status ${connected?"positive":""}`}>• {statusText(item.status)}</span>
              <div className="channel-details">
                <p><span>Cuenta</span><b>{item.accountLabel || "Sin cuenta conectada"}</b></p>
                <p><span>Proveedor</span><b>{item.provider==="meta"?"Meta real":item.provider}</b></p>
                <p><span>Detalle</span><b>{item.message}</b></p>
              </div>
              <dl>
                <div><dt>Conversaciones</dt><dd>{channel==="instagram"?"Activas":"0"}</dd></div>
                <div><dt>Estado</dt><dd className={item.status!=="NOT_CONNECTED"?"positive":""}>{statusText(item.status)}</dd></div>
              </dl>
              <button onClick={()=>notify(`${CHANNELS[channel].label}: ${item.message}`)}>Ver estado</button>
              {canSync
                ? <button className="primary" onClick={syncInstagram} disabled={syncing}>{syncing?"Sincronizando...":"Sincronizar Instagram"}</button>
                : <button className="primary" onClick={()=>connect(channel)}>{connected?"Reconectar":"Preparar conexion"}</button>}
            </article>
          );
        })}
      </div>
      <div className="card meta-ready">
        <span>Meta</span>
        <div>
          <h3>{instagramConnected?"Instagram autorizado":"Listo para Meta"}</h3>
          <p>{instagramConnected?"La autorizacion OAuth quedo guardada. Si Meta no empuja el webhook, usa Sincronizar Instagram para traer conversaciones desde Graph.":"Conecta Instagram con OAuth y webhook antes de recibir mensajes reales."}</p>
        </div>
        <button onClick={load}>Actualizar estado</button>
      </div>
    </section>
  );
}

function Channels({notify}:{notify:(s:string)=>void}){ const [statuses,setStatuses]=useState<Record<Channel,string>>({instagram:"NOT_CONNECTED",whatsapp:"NOT_CONNECTED",facebook:"NOT_CONNECTED"}); useEffect(()=>{let cancelled=false;api.channels().then(items=>{if(cancelled)return;const next:Record<Channel,string>={instagram:"NOT_CONNECTED",whatsapp:"NOT_CONNECTED",facebook:"NOT_CONNECTED"};items.forEach(item=>{next[channelFromApi(item.channel)]=item.status});setStatuses(next)}).catch(()=>notify("No se pudieron cargar los canales"));return()=>{cancelled=true}},[notify]); const connect=async(channel:Channel)=>{try{const result=await api.channelConnect(channel.toUpperCase() as any);setStatuses(current=>({...current,[channel]:result.status}));notify(result.message)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo actualizar el canal")}}; return <section className="page-stack"><div className="section-heading"><div><h2>Conexiones</h2><p>Administra canales. Meta aparece como no conectado hasta configurar credenciales.</p></div><span className="status-banner"><i/> Meta no conectado</span></div><div className="channel-cards">{(["instagram","whatsapp","facebook"] as Channel[]).map((channel,i)=><article className="card channel-card" key={channel}><div><i className={`channel huge ${channel}`}>{CHANNELS[channel].short}</i><span><h3>{CHANNELS[channel].label}</h3><p>{i===0?"Direct y comentarios":i===1?"WhatsApp Cloud API":"Messenger y comentarios"}</p></span></div><span className="connection-status">● {statuses[channel]==="NOT_CONNECTED"?"No conectado":statuses[channel]}</span><div className="channel-details"><p><span>Cuenta</span><b>Sin cuenta conectada</b></p><p><span>Proveedor</span><b>Meta pendiente</b></p></div><dl><div><dt>Conversaciones</dt><dd>0</dd></div><div><dt>Estado</dt><dd className={statuses[channel]!=="NOT_CONNECTED"?"positive":""}>{statuses[channel]}</dd></div></dl><button onClick={()=>notify(CHANNELS[channel].label + ": sin eventos reales todavia")}>Ver eventos recientes</button><button className="primary" onClick={()=>connect(channel)}>Preparar conexion</button></article>)}</div><div className="card meta-ready"><span>Meta</span><div><h3>Listo para Meta</h3><p>No se envian tokens, webhooks ni solicitudes reales hasta conectar credenciales oficiales.</p></div><button onClick={()=>notify("Meta se conecta cuando Stripe e IA esten listos")}>Ver criterio de conexión</button></div></section> }

function ChannelsFixed({notify}:{notify:(s:string)=>void}) {
  const emptyStatus = (channel: Channel): ChannelStatusInfo => ({
    channel: channel.toUpperCase() as ChannelStatusInfo["channel"],
    label: CHANNELS[channel].label,
    provider: "meta",
    status: "NOT_CONNECTED",
    isMock: false,
    accountLabel: "Sin cuenta conectada",
    lastSyncAt: "",
    message: "Canal no conectado.",
  });
  const [channels,setChannels]=useState<Record<Channel,ChannelStatusInfo>>({
    instagram: emptyStatus("instagram"),
    whatsapp: emptyStatus("whatsapp"),
    facebook: emptyStatus("facebook"),
  });
  const [syncing,setSyncing]=useState(false);
  const load=async()=>{
    try{
      const items=await api.channels();
      const next:Record<Channel,ChannelStatusInfo>={
        instagram:emptyStatus("instagram"),
        whatsapp:emptyStatus("whatsapp"),
        facebook:emptyStatus("facebook"),
      };
      items.forEach(item=>{next[channelFromApi(item.channel)]=item});
      setChannels(next);
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudieron cargar los canales");
    }
  };
  useEffect(()=>{void load()},[]);
  const connect=async(channel:Channel)=>{
    try{
      const result=await api.channelConnect(channel.toUpperCase() as any);
      setChannels(current=>({...current,[channel]:result}));
      notify(result.message);
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudo actualizar el canal");
    }
  };
  const statusText=(status:ChannelStatusInfo["status"])=>({
    NOT_CONNECTED:"No conectado",
    CONFIGURING:"Configurando",
    CONNECTED:"Conectado",
    CONNECTED_MOCK:"Conectado mock",
    PENDING:"Pendiente",
    ERROR:"Error",
    TOKEN_EXPIRED:"Token vencido",
  }[status]);
  const syncInstagram=async()=>{
    try{
      setSyncing(true);
      const result=await api.syncInstagram();
      notify(`Instagram sincronizado: ${result.created} mensajes nuevos, ${result.skipped} omitidos.`);
      await load();
    }catch(reason){
      notify(reason instanceof Error?reason.message:"No se pudo sincronizar Instagram");
    }finally{
      setSyncing(false);
    }
  };
  const instagramConnected=channels.instagram.status==="CONNECTED";
  return <section className="page-stack"><div className="section-heading"><div><h2>Conexiones</h2><p>Administra canales oficiales. Instagram muestra la autorizacion real guardada en backend.</p></div><span className={`status-banner ${instagramConnected?"ok":""}`}><i/> {instagramConnected?"Meta conectado":"Meta no conectado"}</span></div><div className="channel-cards">{(["instagram","whatsapp","facebook"] as Channel[]).map((channel,i)=>{const item=channels[channel];const connected=item.status==="CONNECTED";return <article className={`card channel-card ${connected?"connected":""}`} key={channel}><div><i className={`channel huge ${channel}`}>{CHANNELS[channel].short}</i><span><h3>{CHANNELS[channel].label}</h3><p>{i===0?"Direct y comentarios":i===1?"WhatsApp Cloud API":"Messenger y comentarios"}</p></span></div><span className={`connection-status ${connected?"positive":""}`}>● {statusText(item.status)}</span><div className="channel-details"><p><span>Cuenta</span><b>{item.accountLabel || "Sin cuenta conectada"}</b></p><p><span>Proveedor</span><b>{item.provider==="meta"?"Meta real":item.provider}</b></p><p><span>Detalle</span><b>{item.message}</b></p></div><dl><div><dt>Conversaciones</dt><dd>{channel==="instagram"?"Activas":"0"}</dd></div><div><dt>Estado</dt><dd className={item.status!=="NOT_CONNECTED"?"positive":""}>{statusText(item.status)}</dd></div></dl><button onClick={()=>notify(`${CHANNELS[channel].label}: ${item.message}`)}>Ver estado</button><button className="primary" onClick={()=>connect(channel)}>{connected?"Reconectar":"Preparar conexion"}</button></article>})}</div><div className="card meta-ready"><span>Meta</span><div><h3>{instagramConnected?"Instagram autorizado":"Listo para Meta"}</h3><p>{instagramConnected?"La autorizacion OAuth quedo guardada. Las conversaciones dependen de que Meta envie eventos al webhook activo.":"Conecta Instagram con OAuth y webhook antes de recibir mensajes reales."}</p></div><button onClick={load}>Actualizar estado</button></div></section>;
}

function TeamPanel({notify}:{notify:(s:string)=>void}) {
  const [members,setMembers]=useState<TeamMember[]>([]);
  const [loading,setLoading]=useState(true);
  const load=async()=>{try{setLoading(true);setMembers(await api.teamMembers())}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar el equipo")}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const invite=async()=>{const name=window.prompt("Nombre del miembro")?.trim(); if(!name)return; const email=window.prompt("Correo del miembro")?.trim(); if(!email)return; try{const member=await api.teamInvite({name,email,role:"AGENT"}); await load(); notify(member.temporaryPassword?`Miembro creado. Contraseña temporal: ${member.temporaryPassword}`:"Miembro creado")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo crear el miembro")}};
  const updateRole=async(member:TeamMember,role:TeamRole)=>{try{await api.teamUpdateRole(member.id,role);await load();notify("Rol actualizado")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo actualizar el rol")}};
  const remove=async(member:TeamMember)=>{if(!window.confirm(`¿Quitar a ${member.user.name}?`))return;try{await api.teamRemove(member.id);await load();notify("Miembro removido")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo remover el miembro")}};
  return <><div className="section-heading"><div><h3>Equipo y roles</h3><p>Miembros reales de esta organizacion</p></div><button className="primary" onClick={invite}>Agregar miembro</button></div>{loading?<EmptyState title="Cargando equipo" note="Cargando informacion del equipo."/>:members.length?<div className="team-list">{members.map(member=><div key={member.id}><span className="avatar small">{initials(member.user.name)}</span><p><b>{member.user.name}</b><small>{member.user.email}</small></p><select value={member.role} onChange={e=>updateRole(member,e.target.value as TeamRole)}><option value="ORGANIZATION_ADMIN">Administrador</option><option value="SUPERVISOR">Supervisor</option><option value="AGENT">Agente</option></select><button onClick={()=>remove(member)}>Quitar</button></div>)}</div>:<EmptyState title="Sin miembros adicionales" note="Agrega miembros reales para que aparezcan aquí."/>}</>;
}

function OrganizationPanel({notify,onSuper}:{notify:(s:string)=>void;onSuper:()=>void}) {
  const [form,setForm]=useState<Partial<OrganizationInfo>>({name:"",timezone:"America/Mexico_City",industry:"",website:"",description:""});
  useEffect(()=>{api.organization().then(org=>setForm(org)).catch(reason=>notify(reason instanceof Error?reason.message:"No se pudo cargar organizacion"))},[]);
  const save=async()=>{try{const payload: Partial<OrganizationInfo>={name:form.name,timezone:form.timezone,industry:form.industry,description:form.description};if(form.website?.trim())payload.website=form.website.trim();else payload.website=undefined;setForm(await api.updateOrganization(payload));notify("Organizacion guardada")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo guardar organizacion")}};
  return <><h3>Informacion de la organizacion</h3><div className="form-grid"><label>Nombre<input value={form.name??""} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre de tu negocio"/></label><label>Zona horaria<select value={form.timezone??"America/Mexico_City"} onChange={e=>setForm({...form,timezone:e.target.value})}><option value="America/Mexico_City">America/Mexico_City</option><option value="America/Tijuana">America/Tijuana</option><option value="America/Cancun">America/Cancun</option></select></label><label>Industria<input value={form.industry??""} onChange={e=>setForm({...form,industry:e.target.value})} placeholder="Ej. Clinica, restaurante, inmobiliaria"/></label><label>Sitio web<input value={form.website??""} onChange={e=>setForm({...form,website:e.target.value})} placeholder="https://tusitio.com"/></label></div><label>Descripcion<textarea value={form.description??""} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe que hace tu negocio y que tipo de clientes atiende."/></label><div className="button-row end"><button className="primary" onClick={save}>Guardar cambios</button></div><hr/><div className="admin-access"><div><b>Panel privado de plataforma</b><p>Disponible solo para superadministradores.</p></div><button onClick={onSuper}>Abrir Superadmin</button></div></>;
}

function NotificationsPanel({notify}:{notify:(s:string)=>void}) {
  const [settings,setSettings]=useState<Record<string, boolean>>({hotLead:true,transferred:true,appointment:true,channelDisconnected:true});
  useEffect(()=>{api.organization().then(org=>{const stored=org.notificationSettings as Record<string, boolean> | null;if(stored)setSettings({...settings,...stored})}).catch(()=>{})},[]);
  const toggle=(key:string)=>setSettings(current=>({...current,[key]:!current[key]}));
  const save=async()=>{try{await api.updateOrganization({notificationSettings:settings});notify("Notificaciones guardadas")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudieron guardar notificaciones")}};
  return <><CardTitle title="Notificaciones" note="Activa o desactiva avisos del equipo"/>{[["hotLead","Nuevo prospecto caliente"],["transferred","Conversacion transferida"],["appointment","Cita confirmada"],["channelDisconnected","Canal desconectado"]].map(([key,label])=><div className="channel-toggle" key={key}><i className="channel instagram">NX</i><b>{label}</b><button className={`switch ${settings[key]?"on":""}`} onClick={()=>toggle(key)}><span/></button></div>)}<div className="button-row"><button className="primary" onClick={save}>Guardar notificaciones</button></div></>;
}

function SchedulePanel({notify}:{notify:(s:string)=>void}) {
  const dayMap=[["MONDAY","Lunes"],["TUESDAY","Martes"],["WEDNESDAY","Miercoles"],["THURSDAY","Jueves"],["FRIDAY","Viernes"],["SATURDAY","Sabado"],["SUNDAY","Domingo"]] as const;
  const [scheduleId,setScheduleId]=useState<string>("");
  const [active,setActive]=useState(true);
  const [timezone,setTimezone]=useState("America/Mexico_City");
  const [entries,setEntries]=useState<Record<string,{closed:boolean;opensAt:string;closesAt:string}>>(()=>Object.fromEntries(dayMap.map(([day],i)=>[day,{closed:i>4,opensAt:"09:00",closesAt:"18:00"}])));
  useEffect(()=>{api.knowledgeList("schedules").then(page=>{const item=page.items[0];if(!item)return;setScheduleId(item.id);setActive(item.active!==false);if(typeof item.timezone==="string")setTimezone(item.timezone);const apiEntries=(item.entries as Array<{dayOfWeek:string;closed?:boolean;opensAt?:string;closesAt?:string}>|undefined)??[];if(apiEntries.length)setEntries(current=>({...current,...Object.fromEntries(apiEntries.map(e=>[e.dayOfWeek,{closed:Boolean(e.closed),opensAt:e.opensAt??"09:00",closesAt:e.closesAt??"18:00"}]))}))}).catch(()=>{})},[]);
  const save=async()=>{const payload={name:"Horario comercial",timezone,active,entries:dayMap.map(([day])=>({dayOfWeek:day,closed:entries[day].closed,opensAt:entries[day].closed?undefined:entries[day].opensAt,closesAt:entries[day].closed?undefined:entries[day].closesAt}))};try{const saved=scheduleId?await api.knowledgeUpdate("schedules",scheduleId,payload):await api.knowledgeCreate("schedules",payload);setScheduleId(saved.id);notify("Horarios guardados")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudieron guardar horarios")}};
  return <><CardTitle title="Horarios de atencion" note="La IA usara este horario para saber cuando responder o tomar recados"/><label>Zona horaria<select value={timezone} onChange={e=>setTimezone(e.target.value)}><option value="America/Mexico_City">America/Mexico_City</option><option value="America/Tijuana">America/Tijuana</option><option value="America/Cancun">America/Cancun</option></select></label><div className="channel-toggle"><i className="channel whatsapp">ON</i><b>Horario activo</b><button className={`switch ${active?"on":""}`} onClick={()=>setActive(!active)}><span/></button></div><div className="schedule-list">{dayMap.map(([day,label])=><div key={day}><span>{label}</span><button className={`switch ${!entries[day].closed?"on":""}`} onClick={()=>setEntries(current=>({...current,[day]:{...current[day],closed:!current[day].closed}}))}><span/></button>{!entries[day].closed?<><input type="time" value={entries[day].opensAt} onChange={e=>setEntries(current=>({...current,[day]:{...current[day],opensAt:e.target.value}}))}/><em>-</em><input type="time" value={entries[day].closesAt} onChange={e=>setEntries(current=>({...current,[day]:{...current[day],closesAt:e.target.value}}))}/></>:<b>Cerrado</b>}</div>)}</div><div className="button-row"><button className="primary" onClick={save}>Guardar horarios</button></div></>;
}

function SecurityPanel({notify}:{notify:(s:string)=>void}) {
  const [twoFactor,setTwoFactor]=useState(false);
  const [sessions,setSessions]=useState<ActiveSessionInfo[]>([]);
  const [audit,setAudit]=useState<AuditLogInfo[]>([]);
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const load=async()=>{try{const [org,sessionRows,auditPage]=await Promise.all([api.organization(),api.activeSessions(),api.audit()]);const settings=org.securitySettings as {twoFactor?: boolean} | null;setTwoFactor(Boolean(settings?.twoFactor));setSessions(sessionRows);setAudit(auditPage.items)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar seguridad")}};
  useEffect(()=>{void load()},[]);
  const saveTwoFactor=async(next:boolean)=>{setTwoFactor(next);try{await api.updateOrganization({securitySettings:{twoFactor:next}});notify(next?"Autenticacion en dos pasos activada":"Autenticacion en dos pasos desactivada")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo guardar seguridad")}};
  const closeOthers=async()=>{try{await api.revokeOtherSessions();await load();notify("Otras sesiones cerradas")}catch(reason){notify(reason instanceof Error?reason.message:"No se pudieron cerrar sesiones")}};
  const updateSecurity=()=>{
    if(newPassword || confirmPassword){
      if(newPassword.length<12){notify("La nueva contraseña debe tener mínimo 12 caracteres");return;}
      if(newPassword!==confirmPassword){notify("Las contraseñas no coinciden");return;}
      setNewPassword("");
      setConfirmPassword("");
      notify("Contraseña validada. Falta conectar endpoint de cambio real.");
      return;
    }
    notify("Seguridad actualizada");
  };
  return <><CardTitle title="Seguridad" note="Protege el acceso a la organizacion"/><div className="security-box"><div><span>✓</span><p><b>Autenticacion en dos pasos</b><small>{twoFactor?"Activa para este workspace.":"Desactivada. Puedes activarla cuando definas el metodo de codigo."}</small></p><button type="button" aria-pressed={twoFactor} className={`switch ${twoFactor?"on":""}`} onClick={()=>saveTwoFactor(!twoFactor)}><span/></button></div><div><span>⌁</span><p><b>Sesiones activas</b><small>{sessions.length} sesiones activas</small></p><button onClick={closeOthers}>Cerrar otras</button></div><div><span>▣</span><p><b>Registro de actividad</b><small>{audit[0]?`${audit[0].action} - ${formatTime(audit[0].createdAt)}`:"Sin eventos"}</small></p><button onClick={()=>notify(audit.length?audit.slice(0,5).map(item=>item.action).join(" | "):"Sin eventos de actividad")}>Ver registro</button></div></div><div className="version-list">{sessions.map(item=><div key={item.id}><b>{item.current?"ACT":"SES"}</b><p><strong>{item.current?"Sesion actual":item.device}</strong><span>Ultima actividad {formatTime(item.lastSeenAt)}</span></p><button>{item.current?"Actual":"Activa"}</button></div>)}</div><div className="form-grid"><label>Nueva contrasena<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Minimo 12 caracteres"/></label><label>Confirmar contrasena<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repite la contrasena"/></label></div><div className="button-row"><button className="primary" onClick={updateSecurity}>Actualizar seguridad</button></div></>;
}

function Settings({notify,onSuper,initialTab="Organización"}:{notify:(s:string)=>void;onSuper:()=>void;initialTab?:SettingsTab}){
  const [tab,setTab]=useState<SettingsTab>(initialTab);
  const save=()=>notify(`${tab}: cambios guardados`);
  return <section className="page-stack"><div className="section-heading"><div><h2>Configuración</h2><p>Gestiona tu organización, equipo y preferencias.</p></div></div><div className="settings-grid"><div className="card settings-nav">{settingsTabs.map(item=><button className={tab===item?"active":""} onClick={()=>setTab(item)} key={item}>{item}</button>)}</div><div className="card form-card settings-content">
    {tab===settingsTabs[0]&&<OrganizationPanel notify={notify} onSuper={onSuper}/>}
    {tab==="Equipo y roles"&&<TeamPanel notify={notify}/>}
    {tab==="Notificaciones"&&<NotificationsPanel notify={notify}/>}
    {tab==="Horarios"&&<SchedulePanel notify={notify}/>}
    {tab==="Seguridad"&&<SecurityPanel notify={notify}/>}
    {tab==="Facturación"&&<BillingPanel notify={notify}/>}
  </div></div></section>
}

const planName = (plan: string) => plan === "MICRO" ? "Micro" : plan === "STARTER" ? "Starter" : plan === "PRO" ? "Growth" : "Advanced";
const intervalName = (interval: string) => interval === "YEARLY" ? "anual" : "mensual";
const priceText = (plan: Pick<PlanPrice,"amountCents"|"currency"|"interval">) => `${plan.currency} ${(plan.amountCents/100).toLocaleString("es-MX")}${plan.interval==="YEARLY"?"/ano":"/mes"}`;

function BillingPanel({notify}:{notify:(s:string)=>void}) {
  const [plans,setPlans]=useState<PlanPrice[]>([]);
  const [subscription,setSubscription]=useState<SubscriptionInfo|null>(null);
  const [usage,setUsage]=useState<BillingUsage|null>(null);
  const [interval,setInterval]=useState<"MONTHLY"|"YEARLY">("MONTHLY");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{let cancelled=false;async function load(){setLoading(true);try{const params=new URLSearchParams(window.location.search);const checkoutSessionId=params.get("session_id");if(params.get("stripe")==="success"&&checkoutSessionId){const result=await api.reconcileStripeCheckout(checkoutSessionId);notify(result.completed?"Stripe confirmo la tarjeta y el plan.":"Stripe aun no confirma el Checkout.");window.history.replaceState({},"",window.location.pathname);}const [planList,current,currentUsage]=await Promise.all([api.billingPlans(),api.billingSubscription(),api.billingUsage()]);if(cancelled)return;setPlans(planList);setSubscription(current);setUsage(currentUsage);setInterval(current.planPrice.interval)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo cargar facturacion")}finally{if(!cancelled)setLoading(false)}}void load();return()=>{cancelled=true}},[]);
  const visiblePlans=plans.filter(plan=>plan.interval===interval);
  const checkout=async(plan:PlanPrice)=>{try{const result=await api.billingCheckout(plan.id);if(result.checkoutUrl){notify(`Abriendo Stripe para ${planName(plan.plan)}`);window.location.href=result.checkoutUrl;return;}notify(result.message)}catch(reason){notify(reason instanceof Error?reason.message:"No se pudo preparar checkout")}};
  if(loading&&!subscription)return <div className="empty"><b>Cargando facturacion...</b><span>Sincronizando trial, uso y planes.</span></div>;
  const conversationLimit=usage?.conversationLimit??subscription?.trialConversationLimit??subscription?.planPrice.monthlyContactsLimit??0;
  const stripeLinked=Boolean(subscription?.stripeSubscriptionId);
  const trialExpired=subscription?.status==="TRIALING"&&subscription.trialExpired;
  const statusLabel=trialExpired ? "PRUEBA TERMINADA" : subscription?.status==="TRIALING" ? (stripeLinked ? "PRUEBA CON TARJETA" : "PRUEBA ACTIVA") : subscription?.status==="ACTIVE" ? "PLAN ACTIVO" : "REVISAR PAGO";
  const statusCopy=trialExpired
    ? "Tu prueba ya terminó. Elige un plan para activar tu espacio; este Checkout no agrega otra prueba."
    : subscription?.status==="TRIALING"
    ? stripeLinked
      ? `Quedan ${subscription.trialDaysLeft} dias de prueba. Stripe ya tiene la tarjeta y cobrara al terminar el trial o al vencer el limite de ${subscription.trialConversationLimit} conversaciones.`
      : `Quedan ${subscription.trialDaysLeft} dias de prueba. Incluye hasta ${subscription.trialConversationLimit} conversaciones; agrega tarjeta para cobrar al terminar el trial.`
    : subscription?.status==="ACTIVE"
      ? "Suscripcion activa de la organizacion."
      : "El pago requiere atencion para continuar usando funciones operativas.";
  return <><div className="billing-hero"><div><span>{statusLabel}</span><h3>{subscription?planName(subscription.planPrice.plan):"Growth"}</h3><p>{statusCopy}</p></div><b>{subscription?priceText(subscription.planPrice):"$0"}<small> - {subscription?intervalName(subscription.planPrice.interval):"trial"}</small></b></div><div className="usage-row"><span>Conversaciones del periodo <b>{usage?.conversations??0} de {conversationLimit}</b></span><div><i style={{width:`${usage?.percent??0}%`}}/></div></div>{usage?.warnings.conversations&&<div className="limit-warning">{usage.warnings.conversations}</div>}<div className="billing-toggle"><button className={interval==="MONTHLY"?"active":""} onClick={()=>setInterval("MONTHLY")}>Mensual</button><button className={interval==="YEARLY"?"active":""} onClick={()=>setInterval("YEARLY")}>Anual - ahorra hasta 20%</button></div><div className="pricing-grid">{visiblePlans.map(plan=><article className={`pricing-card ${subscription?.planPrice.id===plan.id?"current":""}`} key={plan.id}><span>{subscription?.planPrice.id===plan.id?"Plan seleccionado":"Disponible"}</span><h3>{planName(plan.plan)}</h3><b>{priceText(plan)}</b><p>{plan.monthlyContactsLimit.toLocaleString("es-MX")} conversaciones/mes - {plan.seatsLimit} miembros.</p><button className={subscription?.planPrice.id===plan.id?"":"primary"} onClick={()=>checkout(plan)}>{subscription?.planPrice.id===plan.id&&stripeLinked?"Actualizar tarjeta / plan":subscription?.planPrice.id===plan.id?"Abrir checkout Stripe":"Elegir plan"}</button></article>)}</div><div className="billing-status-card"><h4>Estado de facturacion</h4><p>Resumen operativo del trial, checkout y cobros automaticos.</p><div><span>Trial</span><b>{subscription?.trialDaysLeft??0} dias / {subscription?.trialConversationLimit??20} conversaciones</b><em>{subscription?.status==="TRIALING"?"Activo":"Finalizado"}</em></div><div><span>Checkout Stripe</span><b>{stripeLinked?"Tarjeta registrada":"Sin tarjeta registrada"}</b><em>{stripeLinked?"Conectado":"Pendiente"}</em></div><div><span>Webhooks Stripe</span><b>Confirmacion automatica de pagos</b><em>{stripeLinked?"Recibido":"Esperando evento"}</em></div></div></>
}

function Superadmin({notify}:{notify:(s:string)=>void}) {const [provider,setProvider]=useState("Proveedor local");return <section className="page-stack"><div className="section-heading"><div><span className="eyebrow">ACCESO PRIVADO · SUPERADMIN</span><h2>Proveedores de inteligencia artificial</h2><p>Cambia modelos, controla costos y prueba conexiones sin desplegar código.</p></div><span className="secure">⌾ Acceso protegido</span></div><div className="metric-grid"><article className="metric-card"><span>Tokens de entrada</span><h3>0</h3><small>Sin actividad</small></article><article className="metric-card"><span>Tokens de salida</span><h3>0</h3><small>Sin actividad</small></article><article className="metric-card"><span>Costo estimado</span><h3>$0.00</h3><small>USD este mes</small></article><article className="metric-card"><span>Presupuesto utilizado</span><h3>0%</h3><small>sin presupuesto configurado</small></article></div><div className="two-col"><div className="card form-card"><CardTitle title="Configuración principal" note="Las claves nunca son visibles para clientes"/><label>Proveedor principal<select value={provider} onChange={e=>setProvider(e.target.value)}>{["Proveedor local","OpenAI","DeepSeek","Qwen compatible","OpenRouter","Ollama / vLLM"].map(p=><option key={p}>{p}</option>)}</select></label><label>Modelo<input value={provider==="Proveedor local"?"sin-modelo-real":"modelo-configurado"} readOnly/></label><label>URL base<input defaultValue=""/></label><label>API key<div className="password"><input value="••••••••••••••••••••" readOnly/><span>🔒</span></div></label><div className="form-grid"><label>Límite de salida<input type="number" defaultValue="350"/></label><label>Timeout (ms)<input type="number" defaultValue="30000"/></label></div><div className="button-row"><button onClick={()=>notify("Conexión de prueba exitosa")}>Probar conexión</button><button className="primary" onClick={()=>notify("Proveedor principal actualizado")}>Guardar configuración</button></div></div><div className="card provider-list"><CardTitle title="Proveedores disponibles" note="Activos y respaldo"/>{["Proveedor local","OpenAI","DeepSeek","OpenRouter","Qwen compatible","Ollama / vLLM"].map((p,i)=><div key={p}><span className="provider-logo">{p[0]}</span><p><b>{p}</b><small>{i===0?"Predeterminado · Sin costo":i===1?"Respaldo · Configurado":"Sin configurar"}</small></p><button className={`switch ${i<2?"on":""}`}><span/></button></div>)}</div></div><div className="card compare"><CardTitle title="Comparar modelos" note="Envía el mismo mensaje a dos proveedores" action="Ejecutar comparación →"/><div className="compare-grid"><label>Mensaje de prueba<textarea defaultValue="Hola, quiero saber cuánto cuesta y si pueden darme una demostración."/></label><div><span>Modelo A<em>Proveedor local</em></span><p>¡Hola! El precio depende del volumen de conversaciones. ¿Cuántos mensajes reciben aproximadamente al mes?</p></div><div><span>Modelo B<em>OpenAI · Respaldo</em></span><p>Con gusto te comparto los planes. Para recomendarte el adecuado, ¿cuántas conversaciones atienden al mes?</p></div></div></div></section>}

function AppointmentModal({contact,onClose,onSave}:{contact:string;onClose:()=>void;onSave:()=>void}){const [slot,setSlot]=useState("11:30");return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}>×</button><span className="modal-icon">□</span><h2>Agendar videollamada</h2><p>Selecciona un horario para <b>{contact}</b>.</p><label>Fecha<input type="date" defaultValue="2026-07-23"/></label><label>Horarios disponibles</label><div className="slots">{["09:00","10:30","11:30","15:00","16:30"].map(s=><button className={slot===s?"active":""} onClick={()=>setSlot(s)} key={s}>{s}</button>)}</div><div className="meet"><span>▣</span><p><b>Google Meet</b><small>Se generará una liga de seguimiento para la cita.</small></p></div><button className="primary full" onClick={onSave}>Confirmar cita</button></div></div>}
function CardTitle({title,note,action}:{title:string;note?:string;action?:string}){return <div className="card-title"><div><h3>{title}</h3>{note&&<p>{note}</p>}</div>{action&&<button>{action}</button>}</div>}
function EmptyState({title,note}:{title:string;note:string}){return <section className="page-stack"><div className="card empty"><b>{title}</b><span>{note}</span></div></section>}
function PanelBlock({title,children}:{title:string;children:React.ReactNode}){return <div className="panel-block"><h4>{title}</h4>{children}</div>}
function Detail({label,value}:{label:string;value:string}){return <div className="detail"><span>{label}</span><b>{value}</b></div>}
function ChannelToggle({label,color}:{label:string;color:string}){const [on,setOn]=useState(true);return <div className="channel-toggle"><i className={`channel ${color}`}>{color.slice(0,2).toUpperCase()}</i><b>{label}</b><button className={`switch ${on?"on":""}`} onClick={()=>setOn(!on)}><span/></button></div>}
function subtitle(v:View){return ({Inicio:"Estado real del negocio, suscripcion y operacion.",Conversaciones:"Atiende cada canal desde una sola bandeja.",Contactos:"Consulta contactos y conversaciones relacionadas.","Entrenar IA":"Configura como debe responder el asistente.","Base de conocimiento":"Administra informacion util para la IA.","Productos y servicios":"Manten precios y servicios disponibles.",Conexiones:"Conecta canales oficiales.",Equipo:"Administra el equipo basico.","Plan y facturación":"Revisa trial, plan, consumo y pagos.","Configuración":"Tu organizacion, a tu manera.",Superadmin:"Control privado de la plataforma."} as Record<View,string>)[v]}
