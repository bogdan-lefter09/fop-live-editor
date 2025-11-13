<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:fo="http://www.w3.org/1999/XSL/Format">

  <xsl:output method="xml" indent="yes"/>

  <!-- Root template -->
  <xsl:template match="/">
    <fo:root>
      <!-- Page layout -->
      <fo:layout-master-set>
        <fo:simple-page-master master-name="A4" 
          page-height="29.7cm" 
          page-width="21cm" 
          margin-top="1cm" 
          margin-bottom="1cm" 
          margin-left="2cm" 
          margin-right="2cm">
          <fo:region-body margin-top="1cm" margin-bottom="1cm"/>
          <fo:region-before extent="1cm"/>
          <fo:region-after extent="1cm"/>
        </fo:simple-page-master>
      </fo:layout-master-set>

      <!-- Page sequence -->
      <fo:page-sequence master-reference="A4">
        <!-- Header -->
        <fo:static-content flow-name="xsl-region-before">
          <fo:block text-align="center" font-size="10pt" color="#666666">
            FOP Live Editor - Sample Document
          </fo:block>
        </fo:static-content>

        <!-- Footer -->
        <fo:static-content flow-name="xsl-region-after">
          <fo:block text-align="center" font-size="10pt" color="#666666">
            Page <fo:page-number/>
          </fo:block>
        </fo:static-content>

        <!-- Body -->
        <fo:flow flow-name="xsl-region-body">
          <xsl:apply-templates select="document"/>
        </fo:flow>
      </fo:page-sequence>
    </fo:root>
  </xsl:template>

  <!-- Document template -->
  <xsl:template match="document">
    <!-- Title -->
    <fo:block font-size="24pt" 
      font-weight="bold" 
      text-align="center" 
      space-after="12pt"
      color="#003366">
      <xsl:value-of select="title"/>
    </fo:block>

    <!-- Metadata -->
    <fo:block font-size="10pt" 
      text-align="center" 
      space-after="24pt"
      color="#666666">
      <xsl:text>Author: </xsl:text>
      <xsl:value-of select="metadata/author"/>
      <xsl:text> | Date: </xsl:text>
      <xsl:value-of select="metadata/date"/>
      <xsl:text> | Version: </xsl:text>
      <xsl:value-of select="metadata/version"/>
    </fo:block>

    <!-- Content -->
    <xsl:apply-templates select="content"/>
  </xsl:template>

  <!-- Section template -->
  <xsl:template match="section">
    <fo:block space-before="18pt" space-after="12pt">
      <xsl:apply-templates/>
    </fo:block>
  </xsl:template>

  <!-- Heading template -->
  <xsl:template match="heading">
    <fo:block font-size="16pt" 
      font-weight="bold" 
      space-after="8pt"
      color="#003366">
      <xsl:value-of select="."/>
    </fo:block>
  </xsl:template>

  <!-- Paragraph template -->
  <xsl:template match="paragraph">
    <fo:block font-size="11pt" 
      line-height="1.5" 
      text-align="justify"
      space-after="8pt">
      <xsl:value-of select="."/>
    </fo:block>
  </xsl:template>

  <!-- List template -->
  <xsl:template match="list">
    <fo:list-block provisional-distance-between-starts="0.5cm" 
      provisional-label-separation="0.2cm"
      space-after="8pt">
      <xsl:apply-templates select="item"/>
    </fo:list-block>
  </xsl:template>

  <!-- List item template -->
  <xsl:template match="item">
    <fo:list-item space-after="4pt">
      <fo:list-item-label end-indent="label-end()">
        <fo:block>•</fo:block>
      </fo:list-item-label>
      <fo:list-item-body start-indent="body-start()">
        <fo:block font-size="11pt">
          <xsl:value-of select="."/>
        </fo:block>
      </fo:list-item-body>
    </fo:list-item>
  </xsl:template>

</xsl:stylesheet>
