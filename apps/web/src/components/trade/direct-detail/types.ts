import type {
  MeetingLocationPayload,
  ProposalKind,
} from "../../../lib/statement-store";

export type Role = "buyer" | "provider";

export type MeetingLocation = MeetingLocationPayload;

export type ProposalStatus = "pending" | "accepted" | "declined";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  from: Role;
  status: ProposalStatus;
  createdAt: number;
  scheduledAt?: number;
  location?: MeetingLocation;
  recognition?: string;
}
