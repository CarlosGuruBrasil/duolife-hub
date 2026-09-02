export type BlockType = 'text' | 'button' | 'image' | 'divider' | 'spacer' | 'table' | 'html';

export type SectionType = '1-col' | '2-col' | '2-col-left-wide' | '2-col-right-wide' | '3-col' | '4-col' | 'header' | 'footer' | 'card';

export interface TextBlockContent {
  html: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: number;
  lineHeight?: number;
}

export interface ButtonBlockContent {
  text: string;
  url: string;
  buttonColor: string;
  textColor: string;
  align: 'left' | 'center' | 'right';
  borderRadius: number;
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomLeft?: number;
  borderRadiusBottomRight?: number;
  useCustomCorners?: boolean;
  fontSize: number;
  fontWeight?: string;
  paddingX: number;
  paddingY: number;
  fullWidth?: boolean;
}

export interface ImageBlockContent {
  src: string;
  alt: string;
  url?: string;
  width?: number | string; // px or %
  align: 'left' | 'center' | 'right';
  borderRadius?: number;
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomLeft?: number;
  borderRadiusBottomRight?: number;
  useCustomCorners?: boolean;
}

export interface DividerBlockContent {
  color: string;
  height: number;
  style: 'solid' | 'dashed' | 'dotted';
  paddingY: number;
}

export interface SpacerBlockContent {
  height: number;
}

export interface TableBlockContent {
  headers: string[];
  rows: string[][];
  headerBg?: string;
  headerColor?: string;
  borderColor?: string;
  striped?: boolean;
}

export interface HtmlBlockContent {
  rawHtml: string;
}

export type BlockContent =
  | { type: 'text'; data: TextBlockContent }
  | { type: 'button'; data: ButtonBlockContent }
  | { type: 'image'; data: ImageBlockContent }
  | { type: 'divider'; data: DividerBlockContent }
  | { type: 'spacer'; data: SpacerBlockContent }
  | { type: 'table'; data: TableBlockContent }
  | { type: 'html'; data: HtmlBlockContent };

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: BlockContent;
  styles?: {
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    backgroundColor?: string;
    padding?: number;
  };
}

export interface EmailColumn {
  id: string;
  widthPercent: number; // e.g. 100, 50, 33.33, 25
  styles?: {
    backgroundColor?: string;
    padding?: number;
    verticalAlign?: 'top' | 'middle' | 'bottom';
  };
  blocks: EmailBlock[];
}

export interface EmailSection {
  id: string;
  type: SectionType;
  styles: {
    backgroundColor?: string;
    paddingTop?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
    borderRadius?: number;
    borderRadiusTopLeft?: number;
    borderRadiusTopRight?: number;
    borderRadiusBottomLeft?: number;
    borderRadiusBottomRight?: number;
    useCustomCorners?: boolean;
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
  };
  columns: EmailColumn[];
}

export interface EmailDesignGlobalStyles {
  backgroundColor: string; // Fundo geral do e-mail (fora do container)
  contentWidth: number; // Largura do container central em px (ex: 600)
  contentBackgroundColor: string; // Fundo do container central
  fontFamily: string;
  textColor: string;
  linkColor: string;
}

export interface EmailDesign {
  version: string;
  globalStyles: EmailDesignGlobalStyles;
  sections: EmailSection[];
}
