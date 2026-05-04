export interface ApiResponse<TData> {
  data: TData;
  message?: string;
  pagination?: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}
