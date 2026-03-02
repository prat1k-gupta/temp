import type { Node, Edge } from "@xyflow/react"

// Component imports
import { StartNode } from "@/components/nodes/start-node"
import { CommentNode } from "@/components/nodes/comment-node"
import { WebQuestionNode } from "@/components/nodes/web/web-question-node"
import { WebQuickReplyNode } from "@/components/nodes/web/web-quick-reply-node"
import { WhatsAppQuestionNode } from "@/components/nodes/whatsapp/whatsapp-question-node"
import { WhatsAppQuickReplyNode } from "@/components/nodes/whatsapp/whatsapp-quick-reply-node"
import { WhatsAppListNode } from "@/components/nodes/whatsapp/whatsapp-list-node"
import { WhatsAppMessageNode } from "@/components/nodes/whatsapp/whatsapp-message-node"
import { InstagramQuestionNode } from "@/components/nodes/instagram/instagram-question-node"
import { InstagramQuickReplyNode } from "@/components/nodes/instagram/instagram-quick-reply-node"
import { InstagramListNode } from "@/components/nodes/instagram/instagram-list-node"
import { InstagramDMNode } from "@/components/nodes/instagram/instagram-dm-node"
import { InstagramStoryNode } from "@/components/nodes/instagram/instagram-story-node"
import { ConditionNode } from "@/components/nodes/logic/condition-node"
import { NameNode } from "@/components/nodes/super/name-node"
import { EmailNode } from "@/components/nodes/super/email-node"
import { AddressNode } from "@/components/nodes/super/address-node"
import { DobNode } from "@/components/nodes/super/dob-node"
import { HomeDeliveryNode } from "@/components/nodes/fulfillment/home-delivery-node"
import { TrackingNotificationNode } from "@/components/nodes/fulfillment/tracking-notification-node"
import { EventNode } from "@/components/nodes/fulfillment/event-node"
import { RetailStoreNode } from "@/components/nodes/fulfillment/retail-store-node"
import { GenericIntegrationNode } from "@/components/nodes/integration/generic-integration-node"

export const nodeTypes = {
  start: StartNode,
  comment: CommentNode,
  // Web specific nodes
  webQuestion: WebQuestionNode,
  webQuickReply: WebQuickReplyNode,
  // WhatsApp specific nodes
  whatsappQuestion: WhatsAppQuestionNode,
  whatsappQuickReply: WhatsAppQuickReplyNode,
  whatsappList: WhatsAppListNode,
  whatsappListSpecific: WhatsAppListNode,
  whatsappMessage: WhatsAppMessageNode,
  // Backwards compatibility aliases
  question: WebQuestionNode,
  quickReply: WebQuickReplyNode,
  // Logic nodes
  condition: ConditionNode,
  // Instagram specific nodes
  instagramQuestion: InstagramQuestionNode,
  instagramQuickReply: InstagramQuickReplyNode,
  instagramList: InstagramListNode,
  instagramDM: InstagramDMNode,
  instagramStory: InstagramStoryNode,
  // Super nodes (platform-agnostic)
  name: NameNode,
  email: EmailNode,
  address: AddressNode,
  dob: DobNode,
  // Fulfillment nodes
  homeDelivery: HomeDeliveryNode,
  trackingNotification: TrackingNotificationNode,
  event: EventNode,
  retailStore: RetailStoreNode,
  // Integration nodes
  shopify: GenericIntegrationNode,
  metaAudience: GenericIntegrationNode,
  stripe: GenericIntegrationNode,
  zapier: GenericIntegrationNode,
  google: GenericIntegrationNode,
  salesforce: GenericIntegrationNode,
  mailchimp: GenericIntegrationNode,
  twilio: GenericIntegrationNode,
  slack: GenericIntegrationNode,
  airtable: GenericIntegrationNode,
}

export const initialNodes: Node[] = [
  {
    id: "1",
    type: "start",
    position: { x: 250, y: 25 },
    data: { label: "Start", platform: "web" },
    draggable: true,
    selectable: true,
  },
]

export const initialEdges: Edge[] = [
  {
    id: "e1-2",
    source: "1",
    target: "2",
    type: "default",
    style: { stroke: "#2872F4", strokeWidth: 2 },
  },
]
