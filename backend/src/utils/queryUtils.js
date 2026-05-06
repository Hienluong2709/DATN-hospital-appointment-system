const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGE_SIZE = 100;
const DIACRITIC_REGEX = /\p{Diacritic}+/gu;
const SEARCH_NOISE_REGEX = /[\s\p{P}\p{S}_]+/gu;

const parsePositiveInteger = (value, fieldName, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`${fieldName} phải là số nguyên dương`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
};

export const normalizeOptionalQueryString = (value, maxLength = 100) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    const error = new Error("Query không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
};

export const parsePaginationQuery = (
  query = {},
  {
    defaultPage = DEFAULT_PAGE,
    defaultPageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = DEFAULT_MAX_PAGE_SIZE,
  } = {},
) => {
  const enabled =
    query?.page !== undefined ||
    query?.page_size !== undefined ||
    query?.pageSize !== undefined;

  const page = parsePositiveInteger(query?.page, "page", defaultPage);
  const pageSize = parsePositiveInteger(
    query?.page_size ?? query?.pageSize,
    "page_size",
    defaultPageSize,
  );

  return {
    enabled,
    page,
    page_size: Math.min(pageSize, maxPageSize),
    limit: Math.min(pageSize, maxPageSize),
    offset: (page - 1) * Math.min(pageSize, maxPageSize),
  };
};

export const buildPaginationMeta = ({ page, page_size, total_items }) => {
  const safeTotalItems = Number.isFinite(total_items) ? Math.max(0, total_items) : 0;
  const totalPages =
    page_size > 0 ? Math.max(1, Math.ceil(safeTotalItems / page_size)) : 1;

  return {
    page,
    page_size,
    total_items: safeTotalItems,
    total_pages: totalPages,
  };
};

export const createListResult = ({ items, pagination = null }) => ({
  items,
  pagination,
});

export const normalizeLooseSearchValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .normalize("NFD")
    .replace(DIACRITIC_REGEX, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(SEARCH_NOISE_REGEX, "");
};

export const filterItemsByLooseSearch = (items, query, getSearchValues) => {
  const normalizedQuery = normalizeLooseSearchValue(query);
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => {
    const values = getSearchValues(item);
    const candidates = Array.isArray(values) ? values : [values];

    return candidates.some((candidate) =>
      normalizeLooseSearchValue(candidate).includes(normalizedQuery),
    );
  });
};

export const createPaginatedListResult = ({ items, pagination }) => {
  if (!pagination?.enabled) {
    return createListResult({
      items,
      pagination: null,
    });
  }

  return createListResult({
    items: items.slice(pagination.offset, pagination.offset + pagination.limit),
    pagination: buildPaginationMeta({
      page: pagination.page,
      page_size: pagination.page_size,
      total_items: items.length,
    }),
  });
};
