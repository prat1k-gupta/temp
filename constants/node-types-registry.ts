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
import { InstagramDMNode } from "@/components/nodes/instagram/instagram-dm-node"
import { InstagramStoryNode } from "@/components/nodes/instagram/instagram-story-node"
import { ConditionNode } from "@/components/nodes/logic/condition-node"
import { FlowTemplateNode } from "@/components/nodes/template/flow-template-node"
import { HomeDeliveryNode } from "@/components/nodes/fulfillment/home-delivery-node"
import { TrackingNotificationNode } from "@/components/nodes/fulfillment/tracking-notification-node"
import { EventNode } from "@/components/nodes/fulfillment/event-node"
import { RetailStoreNode } from "@/components/nodes/fulfillment/retail-store-node"
import { GenericIntegrationNode } from "@/components/nodes/integration/generic-integration-node"
import { ApiFetchNode } from "@/components/nodes/action/api-fetch-node"
import { TransferNode } from "@/components/nodes/action/transfer-node"
import { TemplateMessageNode } from "@/components/nodes/action/template-message-node"
import { ActionNode } from "@/components/nodes/action/action-node"
import { WhatsAppFlowNode } from "@/components/nodes/action/whatsapp-flow-node"
import { FlowCompleteNode } from "@/components/nodes/flow/flow-complete-node"

export const nodeTypes = {
  start: StartNode,
  comment: CommentNode,
  // Web specific nodes
  webQuestion: WebQuestionNode,
  webQuickReply: WebQuickReplyNode,
  // WhatsApp specific nodes
  whatsappQuestion: WhatsAppQuestionNode,
  whatsappQuickReply: WhatsAppQuickReplyNode,
  whatsappInteractiveList: WhatsAppListNode,
  // Backward compatibility alias
  interactiveList: WhatsAppListNode,
  whatsappMessage: WhatsAppMessageNode,
  // Backwards compatibility aliases
  question: WebQuestionNode,
  quickReply: WebQuickReplyNode,
  // Logic nodes
  condition: ConditionNode,
  // Instagram specific nodes
  instagramQuestion: InstagramQuestionNode,
  instagramQuickReply: InstagramQuickReplyNode,
  instagramDM: InstagramDMNode,
  instagramStory: InstagramStoryNode,
  // Flow template node
  flowTemplate: FlowTemplateNode,
  // Fulfillment nodes
  homeDelivery: HomeDeliveryNode,
  trackingNotification: TrackingNotificationNode,
  event: EventNode,
  retailStore: RetailStoreNode,
  // Flow control nodes
  flowComplete: FlowCompleteNode,
  // Action nodes
  apiFetch: ApiFetchNode,
  transfer: TransferNode,
  templateMessage: TemplateMessageNode,
  action: ActionNode,
  whatsappFlow: WhatsAppFlowNode,
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
