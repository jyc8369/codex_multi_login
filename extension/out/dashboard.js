"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPanel = void 0;
exports.renderAccountCardHtml = renderAccountCardHtml;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const localization_1 = require("./localization");
class DashboardPanel {
    constructor(context) {
        this.context = context;
    }
    show(accounts, settings, onMessage) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel("codexMultiLoginDashboard", "Codex Multi login", vscode.ViewColumn.One, { enableScripts: true });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
            this.panel.webview.onDidReceiveMessage((message) => onMessage(message));
        }
        this.panel.webview.html = this.render(this.panel.webview, accounts, settings);
    }
    async postMessage(message) {
        if (this.panel) {
            await this.panel.webview.postMessage(message);
        }
    }
    render(webview, accounts, settings) {
        const cards = accounts.map((account) => renderAccountCardHtml(account, settings.locale)).join("");
        const activeCount = accounts.filter((account) => account.isActive).length;
        const missingCount = accounts.filter((account) => account.credentialsMissing).length;
        const activeTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? "theme-light" : "theme-dark";
        const bodyThemeClass = settings.theme === "light" ? "theme-light" : settings.theme === "dark" ? "theme-dark" : activeTheme;
        const html = readAsset("dashboard.html");
        const styles = readAsset("dashboard.css");
        const scriptPath = webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, "webview", "dashboard.js"))).toString();
        return html
            .split("{{LOCALE}}").join(settings.locale)
            .split("{{BODY_CLASS}}").join(bodyThemeClass)
            .split("{{SETTINGS_LABEL}}").join(`${(0, localization_1.t)(settings.locale, "theme")} / ${(0, localization_1.t)(settings.locale, "language")}`)
            .split("{{APP_NAME}}").join((0, localization_1.t)(settings.locale, "appName"))
            .split("{{DASHBOARD_TITLE}}").join((0, localization_1.t)(settings.locale, "dashboardTitle"))
            .split("{{DASHBOARD_SUBTITLE}}").join((0, localization_1.t)(settings.locale, "dashboardSubtitle"))
            .split("{{ADD_ACCOUNT}}").join((0, localization_1.t)(settings.locale, "addAccount"))
            .split("{{IMPORT_EXPORT_JSON}}").join((0, localization_1.t)(settings.locale, "importExportJson"))
            .split("{{REFRESH_ALL}}").join((0, localization_1.t)(settings.locale, "refreshAll"))
            .split("{{SAVED_ACCOUNTS}}").join((0, localization_1.t)(settings.locale, "savedAccounts"))
            .split("{{ACTIVE_ACCOUNTS}}").join((0, localization_1.t)(settings.locale, "activeAccounts"))
            .split("{{ACCOUNTS_IN_WORKSPACE}}").join((0, localization_1.t)(settings.locale, "accountsInWorkspace"))
            .split("{{ACTIVE_HINT}}").join((0, localization_1.t)(settings.locale, "activeHint"))
            .split("{{ACCOUNT_COUNT}}").join(String(accounts.length))
            .split("{{ACTIVE_COUNT}}").join(String(activeCount))
            .split("{{MISSING_COUNT}}").join(String(missingCount))
            .split("{{MISSING_CREDENTIALS_BANNER}}").join(missingCount > 0
            ? `<div class="notice notice-danger">${escapeHtml(`${(0, localization_1.t)(settings.locale, "credentialsMissing")} (${missingCount}) - ${(0, localization_1.t)(settings.locale, "credentialsMissingNotice")}`)}</div>`
            : "")
            .split("{{ACCOUNT_CARDS}}").join(cards || `<div class="empty">${(0, localization_1.t)(settings.locale, "noAccounts")}</div>`)
            .split("{{SETTINGS_TITLE}}").join(`${(0, localization_1.t)(settings.locale, "theme")} / ${(0, localization_1.t)(settings.locale, "language")}`)
            .split("{{THEME_LABEL}}").join((0, localization_1.t)(settings.locale, "theme"))
            .split("{{THEME_AUTO}}").join((0, localization_1.t)(settings.locale, "auto"))
            .split("{{THEME_VSCODE}}").join((0, localization_1.t)(settings.locale, "vscode"))
            .split("{{THEME_DARK}}").join((0, localization_1.t)(settings.locale, "dark"))
            .split("{{THEME_LIGHT}}").join((0, localization_1.t)(settings.locale, "light"))
            .split("{{LANGUAGE_LABEL}}").join((0, localization_1.t)(settings.locale, "language"))
            .split("{{STORAGE_LABEL}}").join((0, localization_1.t)(settings.locale, "storage"))
            .split("{{STORAGE_KEYCHAIN}}").join((0, localization_1.t)(settings.locale, "keychain"))
            .split("{{STORAGE_PLAINTEXT}}").join((0, localization_1.t)(settings.locale, "plaintext"))
            .split("{{LANGUAGE_EN}}").join((0, localization_1.t)(settings.locale, "english"))
            .split("{{LANGUAGE_KO}}").join((0, localization_1.t)(settings.locale, "korean"))
            .split("{{CANCEL}}").join((0, localization_1.t)(settings.locale, "cancel"))
            .split("{{APPLY}}").join((0, localization_1.t)(settings.locale, "apply"))
            .split("{{EDIT_MODE_ENTER}}").join((0, localization_1.t)(settings.locale, "editModeEnter"))
            .split("{{EDIT_MODE_EXIT}}").join((0, localization_1.t)(settings.locale, "editModeExit"))
            .split("{{EDIT_MODE_HINT}}").join((0, localization_1.t)(settings.locale, "editModeHint"))
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
exports.DashboardPanel = DashboardPanel;
function readAsset(fileName) {
    const assetPath = path.join(__dirname, "webview", fileName);
    return fs.readFileSync(assetPath, "utf8");
}
function renderAccountCardHtml(account, locale, refreshState = "idle", refreshError) {
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
        ? `<span class="pill status-missing">${(0, localization_1.t)(locale, "credentialsMissing").toUpperCase()}</span>`
        : "";
    const refreshBanner = refreshState === "error"
        ? `<div class="refresh-banner">${escapeHtml(refreshError || (0, localization_1.t)(locale, "refreshFailed"))}</div>`
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
          <button class="card-action secondary" ${canUseCredentials ? `onclick="send('switchAccount', '${escapeJs(account.id)}')"` : "disabled"}>${(0, localization_1.t)(locale, "switchAccount")}</button>
          <button class="card-action secondary" ${canUseCredentials ? `onclick="send('refreshAccount', '${escapeJs(account.id)}')"` : "disabled"}>${(0, localization_1.t)(locale, "refresh")}</button>
          <button class="card-action secondary" data-allow-while-loading="true" onclick="send('deleteAccount', '${escapeJs(account.id)}')">${(0, localization_1.t)(locale, "delete")}</button>
        </span>
      </div>
      ${refreshBanner}
      <div class="metrics-row">
        ${renderMetricCard("5-hour limit", quota?.hourlyWindowPresent ? quota.hourlyPercentage : undefined, "bar-green", renderQuotaCardMeta(quota?.hourlyWindowPresent, quota?.hourlyWindowMinutes, quota?.hourlyResetTime, quota?.hourlyRequestsLeft, quota?.hourlyRequestsLimit, planContext.hourly, locale))}
        ${renderMetricCard("Weekly limit", quota?.weeklyWindowPresent ? quota.weeklyPercentage : undefined, "bar-yellow", renderQuotaCardMeta(quota?.weeklyWindowPresent, quota?.weeklyWindowMinutes, quota?.weeklyResetTime, quota?.weeklyRequestsLeft, quota?.weeklyRequestsLimit, planContext.weekly, locale))}
        ${renderMetricCard("Months limit", quota?.monthlyWindowPresent ? quota.monthlyPercentage : undefined, "bar-blue", renderQuotaCardMeta(quota?.monthlyWindowPresent, quota?.monthlyWindowMinutes, quota?.monthlyResetTime, quota?.monthlyRequestsLeft, quota?.monthlyRequestsLimit, planContext.monthly, locale))}
        ${renderMetricCard("Code review", quota?.codeReviewWindowPresent ? quota.codeReviewPercentage : undefined, "bar-orange", renderQuotaCardMeta(quota?.codeReviewWindowPresent, quota?.codeReviewWindowMinutes, quota?.codeReviewResetTime, quota?.codeReviewRequestsLeft, quota?.codeReviewRequestsLimit, (0, localization_1.t)(locale, "codeReviewUnavailable"), locale))}
      </div>
      ${quota?.additionalRateLimits?.length ? renderMoreDetails(quota.additionalRateLimits, locale) : ""}
    </div>`;
}
function renderMetricCard(label, percentage, barClass = "bar-blue", meta = "No data") {
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
function renderMoreDetails(limits, locale) {
    return `
    <details class="more">
      <summary>${(0, localization_1.t)(locale, "showAdditionalLimits")}</summary>
      <div class="more-body">
        <div class="extra-list">
          ${limits.map((limit) => renderLimitCard(limit)).join("")}
        </div>
      </div>
    </details>`;
}
function renderLimitCard(limit) {
    return `
    <div class="extra-row">
      <span class="extra-name">${escapeHtml(limit.limitName)}${limit.meteredFeature ? ` · ${escapeHtml(limit.meteredFeature)}` : ""}</span>
      <span class="extra-value">5h ${formatLimitValue(limit.hourlyPercentage)} · Week ${formatLimitValue(limit.weeklyPercentage)}</span>
      <span class="extra-meta">${escapeHtml(renderWindowMeta(limit.hourlyWindowMinutes, limit.hourlyResetTime, limit.hourlyRequestsLeft, limit.hourlyRequestsLimit))}</span>
    </div>`;
}
function formatLimitValue(value) {
    return typeof value === "number" ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : "-";
}
function renderWindowMeta(windowMinutes, resetTime, requestsLeft, requestsLimit) {
    const parts = [];
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
function renderQuotaMeta(windowMinutes, resetTime, requestsLeft, requestsLimit) {
    return renderWindowMeta(windowMinutes, resetTime, requestsLeft, requestsLimit);
}
function renderQuotaCardMeta(present, windowMinutes, resetTime, requestsLeft, requestsLimit, missingMessage, locale = "en") {
    if (present) {
        return renderQuotaMeta(windowMinutes, resetTime, requestsLeft, requestsLimit);
    }
    return missingMessage ?? (0, localization_1.t)(locale, "noDataReturned");
}
function planQuotaContext(planType, locale) {
    const plan = (planType ?? "unknown").toLowerCase();
    if (plan.includes("free")) {
        return {
            hourly: (0, localization_1.t)(locale, "notProvidedFree"),
            weekly: (0, localization_1.t)(locale, "notProvidedFree"),
            monthly: locale === "ko" ? "월간 쿼터가 무료 플랜의 주요 한도입니다." : "Monthly quota is the primary limit on the Free plan."
        };
    }
    if (plan.includes("plus")) {
        return {
            hourly: (0, localization_1.t)(locale, "noDataReturned"),
            weekly: (0, localization_1.t)(locale, "noDataReturned"),
            monthly: (0, localization_1.t)(locale, "notProvidedPlus")
        };
    }
    return { hourly: (0, localization_1.t)(locale, "noDataReturned"), weekly: (0, localization_1.t)(locale, "noDataReturned"), monthly: (0, localization_1.t)(locale, "noDataReturned") };
}
function renderCreditBadge(credits, locale = "en") {
    if (!credits) {
        return `<span class="pill credit-none">${(0, localization_1.t)(locale, "creditsNone")}</span>`;
    }
    if (credits.unlimited) {
        return `<span class="pill credit-unlimited">${(0, localization_1.t)(locale, "creditsUnlimited")}</span>`;
    }
    if (credits.hasCredits) {
        return `<span class="pill credit-available">${escapeHtml(credits.balance || (0, localization_1.t)(locale, "creditsAvailable"))}</span>`;
    }
    return `<span class="pill credit-none">${(0, localization_1.t)(locale, "creditsNone")}</span>`;
}
function planClassName(planType) {
    const plan = (planType ?? "unknown").toLowerCase();
    if (plan.includes("pro"))
        return "plan-pro";
    if (plan.includes("plus"))
        return "plan-plus";
    return "plan-free";
}
function colorClassFromPercentage(value) {
    if (value >= 80)
        return "color-green";
    if (value >= 50)
        return "color-yellow";
    if (value >= 20)
        return "color-orange";
    return "color-red";
}
function colorBarClassFromPercentage(value) {
    if (value >= 80)
        return "bar-green";
    if (value >= 50)
        return "bar-yellow";
    if (value >= 20)
        return "bar-orange";
    return "bar-red";
}
function escapeHtml(input) {
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
function escapeJs(input) {
    return input.replace(/[\\'"]/g, (ch) => `\\${ch}`);
}
//# sourceMappingURL=dashboard.js.map