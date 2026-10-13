import axios, { type AxiosInstance } from "axios";
import { attachRefreshInterceptor } from "./refresh-interceptor";

// No baseURL: the generated client builds absolute URLs from its own config
// (NEXT_PUBLIC_API_URL + the spec's /api/v1/... paths).
const api: AxiosInstance = axios.create({ withCredentials: true });

attachRefreshInterceptor(api);

export default api;
