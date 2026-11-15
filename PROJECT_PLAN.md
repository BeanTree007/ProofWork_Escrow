Build a hackathon MVP called ProofWork.

ProofWork is an AI-assisted escrow platform for freelance web development built on the Monad blockchain.

Problem

Clients are afraid of paying for work that is never delivered.

Developers are afraid of completing work without guaranteed payment.

Current freelance platforms require trusting a centralized intermediary.

Solution

A Monad smart contract acts as neutral escrow.

The client creates a website development project and deposits funds into escrow.

The client provides:
- Project name
- Website description
- Required pages
- Required features
- Escrow amount
- Developer wallet address
- Initial project deadline

The developer completes the website and submits a website URL.

An AI verification engine inspects the submitted website and generates objective evidence including:
- page detection
- screenshots
- contact form detection
- responsiveness checks
- performance metrics
- requirement matching

The AI never decides whether payment should be released.

The AI acts only as an inspector that produces evidence.

The client reviews:
1. The submitted website
2. The AI verification report

The client then chooses:
- Approve
- Raise Dispute

Core Design Principle

The AI verifier is not a decision maker.

The AI only gathers evidence and generates reports.

Examples:
- Detect required pages
- Verify forms exist
- Capture screenshots
- Measure responsiveness
- Measure performance

The AI never determines who is right in a dispute and never controls escrowed funds.

Only the client can approve payment release.

Escrow Logic

Project Creation:
- Client deposits funds into escrow
- Funds are locked in the Monad smart contract

Deadline Extensions:
- Developer may request a deadline extension
- Client may approve or deny the extension
- Approved extensions update the project deadline

Developer Failure:
- If no deliverable is submitted before the deadline expires
- Client may reclaim escrow funds

Client Approval:
- Client approves completed work
- Smart contract releases escrowed funds to developer

Client Dispute:
- Client raises dispute
- Funds remain locked in escrow
- Project enters Disputed state

Client Inactivity:
- After a developer submits a deliverable
- Client has a limited review window (example: 7 days)

If the review window expires with no response:
- Escrow funds are automatically released to the developer

This prevents clients from blocking payment indefinitely.
Email reminders should be sent to both parties reminding them of their deadlines as they get closer.

MVP Scope

Only support website development projects.

Do not attempt to solve arbitration.

The purpose of the dispute state is to demonstrate that neither party can unilaterally obtain funds while a disagreement exists.

Tech Stack

- React frontend
- Flask backend
- Solidity smart contracts
- Monad Testnet
- OpenAI API

Frontend Pages

1. Landing Page
2. Create Project
3. Project Dashboard
4. Request Deadline Extension
5. Submit Deliverable
6. Verification Report

Project Dashboard Should Show

- Project information
- Escrow amount
- Current status
- Time remaining before deadline
- Extension requests
- Submitted website URL
- Verification report

AI Verification Report

- Website Reachability
- Required Page Detection
- Contact Form Detection
- Screenshot Capture
- Mobile Responsiveness
- Lighthouse-style Metrics
- Requirement Checklist
- AI Summary

Smart Contract States

- Created
- Funded
- In Progress
- Submitted
- Approved
- Disputed
- Expired
- Refunded

Repository Structure

frontend/
backend/
contracts/
docs/

Prioritize a polished end-to-end demo over production-grade complexity.

The goal is to demonstrate trustless escrow and AI-assisted verification for freelance web development.

Key Value Proposition:

ProofWork does not attempt to replace human judgment.

Monad secures the funds.

AI gathers evidence.

Humans make the final decision.