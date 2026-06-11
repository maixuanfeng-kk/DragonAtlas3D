import { useEffect, useRef, useState } from "react";
import {
  canEnterDetailMapFrom3D,
  createDetailMapViewport,
  hasAmapJsApiKey,
  shouldResetDetailMapPrompt,
  shouldSuggestDetailMap,
} from "./map/detailMapMode.js";

function nodeFromSelection(selectionNode) {
  if (!selectionNode?.center) {
    return null;
  }

  return {
    name: selectionNode.name,
    fullName: selectionNode.name,
    adcode: selectionNode.id,
    level: selectionNode.node_type === "poi" ? "poi" : "district",
    center: selectionNode.center,
  };
}

export function useDetailMapEntry(setSelectedNode) {
  const [detailMapMode, setDetailMapMode] = useState(false);
  const [detailMapPromptVisible, setDetailMapPromptVisible] = useState(false);
  const [detailMapPromptDismissed, setDetailMapPromptDismissed] = useState(false);
  const [detailMapViewport, setDetailMapViewport] = useState(null);
  const detailMapModeRef = useRef(detailMapMode);
  const detailMapPromptDismissedRef = useRef(detailMapPromptDismissed);
  const detailMapViewportRef = useRef(detailMapViewport);

  useEffect(() => {
    detailMapModeRef.current = detailMapMode;
  }, [detailMapMode]);

  useEffect(() => {
    detailMapPromptDismissedRef.current = detailMapPromptDismissed;
  }, [detailMapPromptDismissed]);

  useEffect(() => {
    detailMapViewportRef.current = detailMapViewport;
  }, [detailMapViewport]);

  const syncDetailMapPrompt = ({ currentNode, bounds }) => {
    const viewport = createDetailMapViewport({ currentNode, bounds });
    setDetailMapViewport(viewport);

    if (!viewport) {
      setDetailMapPromptVisible(false);
      return;
    }

    const shouldResetPrompt = shouldResetDetailMapPrompt({
      currentNode,
      span: viewport.span,
      promptDismissed: detailMapPromptDismissedRef.current,
    });

    const promptDismissed = shouldResetPrompt ? false : detailMapPromptDismissedRef.current;
    if (shouldResetPrompt) {
      detailMapPromptDismissedRef.current = false;
      setDetailMapPromptDismissed(false);
    }

    const shouldShowPrompt = shouldSuggestDetailMap({
      currentNode,
      span: viewport.span,
      hasJsApiKey: hasAmapJsApiKey(),
      detailMode: detailMapModeRef.current,
      promptDismissed,
    });

    setDetailMapPromptVisible(shouldShowPrompt);
  };

  const setViewportFromNode = (node, zoom = 11) => {
    const viewport = createDetailMapViewport({ currentNode: node, bounds: null });
    if (!viewport) {
      return;
    }

    setDetailMapViewport({ ...viewport, zoom });
  };

  const handlePreviewSelectionNode = (selectionNode) => {
    const derivedNode = nodeFromSelection(selectionNode);
    if (!derivedNode) {
      return;
    }

    setSelectedNode(derivedNode);
    setDetailMapViewport((current) =>
      current
        ? { ...current, center: derivedNode.center, zoom: 15, node: derivedNode }
        : { center: derivedNode.center, span: 0, zoom: 15, node: derivedNode, bounds: null },
    );
  };

  const handlePreviewSelectionNodes = (selectionNodes) => {
    if (selectionNodes.length) {
      handlePreviewSelectionNode(selectionNodes[selectionNodes.length - 1]);
    }
  };

  const enterDetailMap = () => {
    if (!detailMapViewportRef.current) {
      return;
    }

    setDetailMapPromptVisible(false);
    setDetailMapMode(true);
  };

  const requestEnterDetailMap = (attempt = 0) => {
    if (detailMapViewportRef.current) {
      enterDetailMap();
      return;
    }

    if (attempt < 10) {
      window.setTimeout(() => requestEnterDetailMap(attempt + 1), 120);
    }
  };

  const dismissDetailMapPrompt = () => {
    detailMapPromptDismissedRef.current = true;
    setDetailMapPromptDismissed(true);
    setDetailMapPromptVisible(false);
  };

  const exitDetailMap = () => {
    detailMapModeRef.current = false;
    detailMapPromptDismissedRef.current = true;
    setDetailMapMode(false);
    setDetailMapPromptDismissed(true);
    setDetailMapPromptVisible(false);
  };

  return {
    detailMapMode,
    detailMapPromptVisible,
    detailMapViewport,
    detailEntryEnabled: canEnterDetailMapFrom3D({
      hasJsApiKey: hasAmapJsApiKey(),
      detailMode: detailMapMode,
      viewport: detailMapViewport,
    }),
    syncDetailMapPrompt,
    setViewportFromNode,
    handlePreviewSelectionNode,
    handlePreviewSelectionNodes,
    enterDetailMap,
    requestEnterDetailMap,
    dismissDetailMapPrompt,
    exitDetailMap,
  };
}
