// User interface representing a user in the system
export interface User {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
}

// Document interface representing a document in the system
export interface Document {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    authorId: string;
}

// Conversation interface representing a conversation thread
export interface Conversation {
    id: string;
    participants: string[]; // Array of user IDs
    createdAt: Date;
    updatedAt: Date;
}

// Message interface representing a message in a conversation
export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    createdAt: Date;
}

// Gap Analysis interface representing a gap analysis report
export interface GapAnalysis {
    id: string;
    documentId: string;
    analysisDetails: string;
    createdAt: Date;
    updatedAt: Date;
}

// Additional domain types can be added below
