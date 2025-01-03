
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// DocuSign credentials from environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');
const USER_ID = process.env.USER_ID;

const DOCUSIGN_AUTH_SERVER = 'https://account-d.docusign.com';

// Generate a JWT for authentication
async function getJWTToken() {
    try {
        const currentTime = Math.floor(Date.now() / 1000);
        const jwtPayload = {
            iss: CLIENT_ID,
            sub: USER_ID,
            aud: 'account-d.docusign.com',
            iat: currentTime,
            exp: currentTime + 600, // Token expires in 10 minutes
            scope: 'signature impersonation',
        };

        const token = jwt.sign(jwtPayload, PRIVATE_KEY, { algorithm: 'RS256' });

        const response = await axios.post(
            `${DOCUSIGN_AUTH_SERVER}/oauth/token`,
            new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: token,
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }
        );

        return response.data.access_token;
    } catch (error) {
        if (error.response?.data?.error === 'consent_required') {
            console.error('Consent is required. Please grant consent using the following URL:');
            console.error(
                `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${CLIENT_ID}&redirect_uri=http://localhost:3000/ds/callback`
            );
        } else {
            console.error('Error generating JWT token:', error.response?.data || error.message);
        }
        throw new Error('Failed to generate JWT token');
    }
}

// Get the user's base URI from DocuSign
async function getBaseURI(accessToken) {
    try {
        const response = await axios.get(`${DOCUSIGN_AUTH_SERVER}/oauth/userinfo`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data.accounts[0].base_uri;
    } catch (error) {
        console.error('Error retrieving base URI:', error.response?.data || error.message);
        throw new Error('Failed to retrieve base URI');
    }
}

// Create an envelope for eSignature
async function createEnvelope({ participants, signingType, base64Content }) {
    try {
        const accessToken = await getJWTToken();
        const baseURI = await getBaseURI(accessToken);

        const envelopePayload = {
            emailSubject: 'Please sign this agreement',
            documents: [
                {
                    documentBase64: base64Content, // Ensure this is valid base64 content
                    name: 'Agreement.pdf',
                    fileExtension: 'pdf',
                    documentId: '1',
                },
            ],
            recipients: {
                signers: participants.map((participant, index) => ({
                    email: participant.email,
                    name: participant.name,
                    recipientId: (index + 1).toString(),
                    routingOrder: (index + 1).toString(),
                    tabs: {
                        signHereTabs: [
                            {
                                documentId: '1',
                                pageNumber: '1',
                                xPosition: '250', // Center horizontally for A4 page
                                yPosition: '792', // Bottom of A4 page with a margin
                            },
                        ],
                    },
                })),
            },
            status: 'sent',
        };

        if (signingType === 'notary') {
            envelopePayload.recipients.notaries = participants.map((participant, index) => ({
                email: participant.email,
                name: participant.name,
                recipientId: (index + 1).toString(),
                routingOrder: (index + 1).toString(),
            }));
        }

        const response = await axios.post(
            `${baseURI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`,
            envelopePayload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data;
    } catch (error) {
        console.error('Error creating envelope:', {
            response: error.response?.data,
            status: error.response?.status,
            message: error.message,
        });
        throw new Error('Failed to create envelope');
    }
}

// Route to handle POST requests
export async function POST(request) {
    try {
        const { participants, signingType, file } = await request.json();

        if (!participants || !participants.length) {
            return NextResponse.json(
                { error: 'Participants are required' },
                { status: 400 }
            );
        }

        if (!['regular', 'notary'].includes(signingType)) {
            return NextResponse.json(
                { error: 'Invalid signing type' },
                { status: 400 }
            );
        }

        const base64Content = file.replace(/^data:application\/pdf;base64,/, ''); // Clean base64 string if needed

        const result = await createEnvelope({ participants, signingType, base64Content });

        return NextResponse.json({
            message: 'Envelope created successfully',
            result,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// Route to handle DocuSign callback
export async function GET(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
        return NextResponse.json({ error: 'Authorization code is missing' }, { status: 400 });
    }

    console.log('Authorization code received:', code);
    return NextResponse.json({ message: 'Callback received', code });
}
