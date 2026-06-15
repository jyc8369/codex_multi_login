import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { CodexAccountRecord, CodexAdditionalQuotaLimit, CodexQuotaSummary } from "./types";
import { Locale, StorageMode, ThemeMode, t } from "./localization";

export interface DashboardSettings {
  locale: Locale;
  theme: ThemeMode;
  storageMode: StorageMode;
}

export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(
    accounts: CodexAccountRecord[],
    settings: DashboardSettings,
    onMessage: (message: unknown) => Promise<void> | void
  ): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "codexMultiLoginDashboard",
        "Codex Multi login",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.panel.webview.onDidReceiveMessage((message) => onMessage(message));
    }

    this.panel.webview.html = this.render(this.panel.webview, accounts, settings);
  }

  async postMessage(message: unknown): Promise<void> {
    if (this.panel) {
      await this.panel.webview.postMessage(message);
    }
  }

  private render(webview: vscode.Webview, accounts: CodexAccountRecord[], settings: DashboardSettings): string {
    const cards = accounts.map((account) => renderAccountCardHtml(account, settings.locale)).join("");
    const activeCount = accounts.filter((account) => account.isActive).length;
    const missingCount = accounts.filter((account) => account.credentialsMissing).length;
    const activeTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? "theme-light" : "theme-dark";
    const bodyThemeClass =
      settings.theme === "light" ? "theme-light" : settings.theme === "dark" ? "theme-dark" : activeTheme;

    const html = readAsset("dashboard.html");
    const styles = readAsset("dashboard.css");
    const scriptPath = webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, "webview", "dashboard.js"))).toString();

    return html
      .split("{{LOCALE}}").join(settings.locale)
      .split("{{BODY_CLASS}}").join(bodyThemeClass)
      .split("{{SETTINGS_LABEL}}").join(`${t(settings.locale, "theme")} / ${t(settings.locale, "language")}`)
      .split("{{APP_NAME}}").join(t(settings.locale, "appName"))
      .split("{{DASHBOARD_TITLE}}").join(t(settings.locale, "dashboardTitle"))
      .split("{{DASHBOARD_SUBTITLE}}").join(t(settings.locale, "dashboardSubtitle"))
      .split("{{ADD_ACCOUNT}}").join(t(settings.locale, "addAccount"))
      .split("{{IMPORT_EXPORT_JSON}}").join(t(settings.locale, "importExportJson"))
      .split("{{REFRESH_ALL}}").join(t(settings.locale, "refreshAll"))
      .split("{{SAVED_ACCOUNTS}}").join(t(settings.locale, "savedAccounts"))
      .split("{{ACTIVE_ACCOUNTS}}").join(t(settings.locale, "activeAccounts"))
      .split("{{ACCOUNTS_IN_WORKSPACE}}").join(t(settings.locale, "accountsInWorkspace"))
      .split("{{ACTIVE_HINT}}").join(t(settings.locale, "activeHint"))
      .split("{{ACCOUNT_COUNT}}").join(String(accounts.length))
      .split("{{ACTIVE_COUNT}}").join(String(activeCount))
      .split("{{MISSING_COUNT}}").join(String(missingCount))
      .split("{{MISSING_CREDENTIALS_BANNER}}").join(
        missingCount > 0
          ? `<div class="notice notice-danger">${escapeHtml(
              `${t(settings.locale, "credentialsMissing")} (${missingCount}) - ${t(settings.locale, "credentialsMissingNotice")}`
            )}</div>`
          : ""
      )
      .split("{{ACCOUNT_CARDS}}").join(cards || `<div class="empty">${t(settings.locale, "noAccounts")}</div>`)
      .split("{{SETTINGS_TITLE}}").join(`${t(settings.locale, "theme")} / ${t(settings.locale, "language")}`)
      .split("{{THEME_LABEL}}").join(t(settings.locale, "theme"))
      .split("{{THEME_AUTO}}").join(t(settings.locale, "auto"))
      .split("{{THEME_VSCODE}}").join(t(settings.locale, "vscode"))
      .split("{{THEME_DARK}}").join(t(settings.locale, "dark"))
      .split("{{THEME_LIGHT}}").join(t(settings.locale, "light"))
      .split("{{LANGUAGE_LABEL}}").join(t(settings.locale, "language"))
      .split("{{STORAGE_LABEL}}").join(t(settings.locale, "storage"))
      .split("{{STORAGE_KEYCHAIN}}").join(t(settings.locale, "keychain"))
      .split("{{STORAGE_PLAINTEXT}}").join(t(settings.locale, "plaintext"))
      .split("{{LANGUAGE_EN}}").join(t(settings.locale, "english"))
      .split("{{LANGUAGE_KO}}").join(t(settings.locale, "korean"))
      .split("{{CANCEL}}").join(t(settings.locale, "cancel"))
      .split("{{APPLY}}").join(t(settings.locale, "apply"))
      .split("{{EDIT_MODE_ENTER}}").join(t(settings.locale, "editModeEnter"))
      .split("{{EDIT_MODE_EXIT}}").join(t(settings.locale, "editModeExit"))
      .split("{{EDIT_MODE_HINT}}").join(t(settings.locale, "editModeHint"))
      .split("{{THEME_AUTO_SELECTED}}").join(settings.theme === "auto" ? "selected" : "")
      .split("{{THEME_VSCODE_SELECTED}}").join(settings.theme === "vscode" ? "selected" : "")
      .split("{{THEME_DARK_SELECTED}}").join(settings.theme === "dark" ? "selected" : "")
      .split("{{THEME_LIGHT_SELECTED}}").join(settings.theme === "light" ? "selected" : "")
      .split("{{LOCALE_EN_SELECTED}}").join(settings.locale === "en" ? "selected" : "")
      .split("{{LOCALE_KO_SELECTED}}").join(settings.locale === "ko" ? "selected" : "")
      .split("{{STORAGE_KEYCHAIN_SELECTED}}").join(settings.storageMode === "keychain" ? "selected" : "")
      .split("{{STORAGE_PLAINTEXT_SELECTED}}").join(settings.storageMode === "plaintext" ? "selected" : "")
      .split("{{STYLES}}").join(styles)
      .split("{{SCRIPT_PATH}}").join(scriptPath.toString());
  }
}

function readAsset(fileName: string): string {
  const assetPath = path.join(__dirname, "webview", fileName);
  return fs.readFileSync(assetPath, "utf8");
}

export type AccountRefreshState = "idle" | "loading" | "error";

export function renderAccountCardHtml(
  account: CodexAccountRecord,
  locale: Locale,
  refreshState: AccountRefreshState = "idle",
  refreshError?: string
): string {
  const quota = account.quotaSummary;
  const planClass = planClassName(account.planType);
  const stateClass = account.credentialsMissing ? "status-missing" : account.isActive ? "status-active" : "status-inactive";
  const cardClass = account.credentialsMissing
    ? "account-card missing"
    : account.isActive
      ? "account-card active"
      : "account-card inactive";
  const refreshClass = refreshState === "loading" ? "refreshing" : refreshState === "error" ? "refresh-error" : "";
  const planContext = planQuotaContext(account.planType, locale);
  const canUseCredentials = !account.credentialsMissing && !!account.tokens;
  const missingBadge = account.credentialsMissing
    ? `<span class="pill status-missing">${t(locale, "credentialsMissing").toUpperCase()}</span>`
    : "";
  const refreshBanner =
    refreshState === "error"
      ? `<div class="refresh-banner">${escapeHtml(refreshError || t(locale, "refreshFailed"))}</div>`
      : "";

  return `
    <div class="${[cardClass, refreshClass].filter(Boolean).join(" ")}" draggable="true" data-account-id="${escapeHtml(account.id)}" data-refresh-state="${refreshState}">
      <div class="card-head">
        <span class="email">${escapeHtml(account.email)}</span>
        <span class="pill ${planClass}">${escapeHtml((account.planType ?? "unknown").toUpperCase())}</span>
        <span class="pill ${stateClass}">${account.isActive ? "ACTIVE" : "INACTIVE"}</span>
        ${missingBadge}
        ${renderCreditBadge(quota?.credits, locale)}
        <span class="card-actions">
          <button class="card-action secondary" ${canUseCredentials ? `onclick="send('switchAccount', '${escapeJs(account.id)}')"` : "disabled"}>${t(locale, "switchAccount")}</button>
          <button class="card-action secondary" ${canUseCredentials ? `onclick="send('refreshAccount', '${escapeJs(account.id)}')"` : "disabled"}>${t(locale, "refresh")}</button>
          <button class="card-action secondary" data-allow-while-loading="true" onclick="send('deleteAccount', '${escapeJs(account.id)}')">${t(locale, "delete")}</button>
        </span>
      </div>
      ${refreshBanner}
      <div class="metrics-row">
        ${renderMetricCard("5-hour limit", quota?.hourlyWindowPresent ? quota.hourlyPercentage : undefined, "bar-green", renderQuotaCardMeta(quota?.hourlyWindowPresent, quota?.hourlyWindowMinutes, quota?.hourlyResetTime, quota?.hourlyRequestsLeft, quota?.hourlyRequestsLimit, planContext.hourly, locale))}
        ${renderMetricCard("Weekly limit", quota?.weeklyWindowPresent ? quota.weeklyPercentage : undefined, "bar-yellow", renderQuotaCardMeta(quota?.weeklyWindowPresent, quota?.weeklyWindowMinutes, quota?.weeklyResetTime, quota?.weeklyRequestsLeft, quota?.weeklyRequestsLimit, planContext.weekly, locale))}
        ${renderMetricCard("Months limit", quota?.monthlyWindowPresent ? quota.monthlyPercentage : undefined, "bar-blue", renderQuotaCardMeta(quota?.monthlyWindowPresent, quota?.monthlyWindowMinutes, quota?.monthlyResetTime, quota?.monthlyRequestsLeft, quota?.monthlyRequestsLimit, planContext.monthly, locale))}
        ${renderMetricCard("Code review", quota?.codeReviewWindowPresent ? quota.codeReviewPercentage : undefined, "bar-orange", renderQuotaCardMeta(quota?.codeReviewWindowPresent, quota?.codeReviewWindowMinutes, quota?.codeReviewResetTime, quota?.codeReviewRequestsLeft, quota?.codeReviewRequestsLimit, t(locale, "codeReviewUnavailable"), locale))}
      </div>
      ${quota?.additionalRateLimits?.length ? renderMoreDetails(quota.additionalRateLimits, locale) : ""}
    </div>`;
}

function renderMetricCard(label: string, percentage?: number, barClass = "bar-blue", meta = "No data"): string {
  const value = typeof percentage === "number" ? `${Math.max(0, Math.min(100, Math.round(percentage)))}%` : "-";
  const width = typeof percentage === "number" ? Math.max(0, Math.min(100, Math.round(percentage))) : 0;
  const effectiveBarClass = typeof percentage === "number" ? colorBarClassFromPercentage(width) : barClass;
  return `
    <div class="metric">
      <div class="metric-skeleton" aria-hidden="true"></div>
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value ${value === "-" ? "muted" : colorClassFromPercentage(width)}">${escapeHtml(value)}</div>
      <div class="metric-bar"><span class="${effectiveBarClass}" style="width:${width}%"></span></div>
      <div class="metric-meta">${escapeHtml(meta)}</div>
    </div>`;
}

function renderMoreDetails(limits: CodexAdditionalQuotaLimit[], locale: Locale): string {
  return `
    <details class="more">
      <summary>${t(locale, "showAdditionalLimits")}</summary>
      <div class="more-body">
        <div class="extra-list">
          ${limits.map((limit) => renderLimitCard(limit)).join("")}
        </div>
      </div>
    </details>`;
}

function renderLimitCard(limit: CodexAdditionalQuotaLimit): string {
  return `
    <div class="extra-row">
      <span class="extra-name">${escapeHtml(limit.limitName)}${limit.meteredFeature ? ` · ${escapeHtml(limit.meteredFeature)}` : ""}</span>
      <span class="extra-value">5h ${formatLimitValue(limit.hourlyPercentage)} · Week ${formatLimitValue(limit.weeklyPercentage)}</span>
      <span class="extra-meta">${escapeHtml(renderWindowMeta(limit.hourlyWindowMinutes, limit.hourlyResetTime, limit.hourlyRequestsLeft, limit.hourlyRequestsLimit))}</span>
    </div>`;
}

function formatLimitValue(value?: number): string {
  return typeof value === "number" ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : "-";
}

function renderWindowMeta(
  windowMinutes?: number,
  resetTime?: number,
  requestsLeft?: number,
  requestsLimit?: number
): string {
  const parts: string[] = [];
  if (typeof requestsLeft === "number" && typeof requestsLimit === "number") {
    parts.push(`${requestsLeft}/${requestsLimit} remaining`);
  }
  if (typeof windowMinutes === "number") {
    parts.push(`${windowMinutes}m`);
  }
  if (typeof resetTime === "number") {
    parts.push(`reset ${new Date(resetTime * 1000).toLocaleString()}`);
  }
  return parts.length ? parts.join(" · ") : "No window data";
}

function renderQuotaMeta(
  windowMinutes?: number,
  resetTime?: number,
  requestsLeft?: number,
  requestsLimit?: number
): string {
  return renderWindowMeta(windowMinutes, resetTime, requestsLeft, requestsLimit);
}

function renderQuotaCardMeta(
  present: boolean | undefined,
  windowMinutes?: number,
  resetTime?: number,
  requestsLeft?: number,
  requestsLimit?: number,
  missingMessage?: string,
  locale: Locale = "en"
): string {
  if (present) {
    return renderQuotaMeta(windowMinutes, resetTime, requestsLeft, requestsLimit);
  }
  return missingMessage ?? t(locale, "noDataReturned");
}

function planQuotaContext(planType: string | undefined, locale: Locale): { hourly: string; weekly: string; monthly: string } {
  const plan = (planType ?? "unknown").toLowerCase();
  if (plan.includes("free")) {
    return {
      hourly: t(locale, "notProvidedFree"),
      weekly: t(locale, "notProvidedFree"),
      monthly: locale === "ko" ? "월간 쿼터가 무료 플랜의 주요 한도입니다." : "Monthly quota is the primary limit on the Free plan."
    };
  }

  if (plan.includes("plus")) {
    return {
      hourly: t(locale, "noDataReturned"),
      weekly: t(locale, "noDataReturned"),
      monthly: t(locale, "notProvidedPlus")
    };
  }

  return { hourly: t(locale, "noDataReturned"), weekly: t(locale, "noDataReturned"), monthly: t(locale, "noDataReturned") };
}

function renderCreditBadge(credits?: CodexQuotaSummary["credits"], locale: Locale = "en"): string {
  if (!credits) {
    return `<span class="pill credit-none">${t(locale, "creditsNone")}</span>`;
  }
  if (credits.unlimited) {
    return `<span class="pill credit-unlimited">${t(locale, "creditsUnlimited")}</span>`;
  }
  if (credits.hasCredits) {
    return `<span class="pill credit-available">${escapeHtml(credits.balance || t(locale, "creditsAvailable"))}</span>`;
  }
  return `<span class="pill credit-none">${t(locale, "creditsNone")}</span>`;
}

function planClassName(planType?: string): string {
  const plan = (planType ?? "unknown").toLowerCase();
  if (plan.includes("pro")) return "plan-pro";
  if (plan.includes("plus")) return "plan-plus";
  return "plan-free";
}

function colorClassFromPercentage(value: number): string {
  if (value >= 80) return "color-green";
  if (value >= 50) return "color-yellow";
  if (value >= 20) return "color-orange";
  return "color-red";
}

function colorBarClassFromPercentage(value: number): string {
  if (value >= 80) return "bar-green";
  if (value >= 50) return "bar-yellow";
  if (value >= 20) return "bar-orange";
  return "bar-red";
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function escapeJs(input: string): string {
  return input.replace(/[\\'"]/g, (ch) => `\\${ch}`);
}
