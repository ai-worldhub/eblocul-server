export type LogValue = string | number | boolean | null;

export interface LogEvents {
    'app.started': { port: number };
    'http.unhandled_error': { errorType: string; errorCode: string | null };
}
