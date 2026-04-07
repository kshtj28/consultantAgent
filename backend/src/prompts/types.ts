export interface PromptTemplate {
    name: string;
    version: string;
    description: string;
    build: (...args: any[]) => string;
}
