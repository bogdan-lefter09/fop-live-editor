<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:fo="http://www.w3.org/1999/XSL/Format">

  <!-- Common formatting templates -->

  <!-- Format currency -->
  <xsl:template name="format-currency">
    <xsl:param name="amount"/>
    <xsl:text>$</xsl:text>
    <xsl:value-of select="format-number($amount, '#,##0.00')"/>
  </xsl:template>

  <!-- Format date -->
  <xsl:template name="format-date">
    <xsl:param name="date"/>
    <xsl:value-of select="$date"/>
  </xsl:template>

  <!-- Section heading -->
  <xsl:template name="section-heading">
    <xsl:param name="text"/>
    <fo:block font-size="12pt" font-weight="bold" color="#003366" 
              space-after="8pt" space-before="10pt">
      <xsl:value-of select="$text"/>
    </fo:block>
  </xsl:template>

  <!-- Table header cell -->
  <xsl:template name="table-header-cell">
    <xsl:param name="text"/>
    <xsl:param name="align" select="'left'"/>
    <fo:table-cell padding="8pt" border="1pt solid #003366" background-color="#003366">
      <fo:block font-weight="bold" font-size="10pt" color="white" text-align="{$align}">
        <xsl:value-of select="$text"/>
      </fo:block>
    </fo:table-cell>
  </xsl:template>

  <!-- Table data cell -->
  <xsl:template name="table-data-cell">
    <xsl:param name="text"/>
    <xsl:param name="align" select="'left'"/>
    <fo:table-cell padding="6pt" border="1pt solid #cccccc">
      <fo:block font-size="9pt" text-align="{$align}">
        <xsl:value-of select="$text"/>
      </fo:block>
    </fo:table-cell>
  </xsl:template>

</xsl:stylesheet>
