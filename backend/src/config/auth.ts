// JWT authentication configuration
import jwt from 'jsonwebtoken';

interface User {
    id: string;
    email?: string;
    name?: string;
}

const secretKey = process.env.JWT_SECRET || 'your-secret-key';
const expirationTime = '1h'; // Token expiration time

export const generateToken = (user: User): string => {
    return jwt.sign({ id: user.id }, secretKey, { expiresIn: expirationTime });
};

export const verifyToken = (token: string): jwt.JwtPayload | string => {
    return jwt.verify(token, secretKey);
};