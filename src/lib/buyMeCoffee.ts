const BUY_ME_A_COFFEE_HOST_PATTERN = /(^|\.)buymeacoffee\.com$/i;
const BUY_ME_A_COFFEE_HANDLE_PATTERN = /[^a-zA-Z0-9._-]/g;

export const BUY_ME_A_COFFEE_BASE_URL = 'https://buymeacoffee.com';
export const BUY_ME_A_COFFEE_ICON_URL = 'https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg';

export function normalizeBuyMeCoffeeHandle(value?: string | null): string {
    if (!value) {
        return '';
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return '';
    }

    if (/^https?:\/\//i.test(trimmedValue)) {
        try {
            const parsedUrl = new URL(trimmedValue);
            if (!BUY_ME_A_COFFEE_HOST_PATTERN.test(parsedUrl.hostname)) {
                return '';
            }

            const firstPathSegment = parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
            return firstPathSegment.replace(BUY_ME_A_COFFEE_HANDLE_PATTERN, '');
        } catch {
            return '';
        }
    }

    return trimmedValue
        .replace(/^@/, '')
        .replace(/^buymeacoffee\.com\//i, '')
        .replace(BUY_ME_A_COFFEE_HANDLE_PATTERN, '');
}

export function buildBuyMeCoffeeUrl(handle?: string | null): string | null {
    const normalizedHandle = normalizeBuyMeCoffeeHandle(handle);

    if (!normalizedHandle) {
        return null;
    }

    return `${BUY_ME_A_COFFEE_BASE_URL}/${normalizedHandle}`;
}

export function formatBuyMeCoffeeHandle(handle?: string | null): string {
    const normalizedHandle = normalizeBuyMeCoffeeHandle(handle);
    return normalizedHandle ? `@${normalizedHandle}` : '';
}