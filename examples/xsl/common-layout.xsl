<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:fo="http://www.w3.org/1999/XSL/Format">

  <!-- Common page layout templates -->
  
  <!-- A4 Page Master -->
  <xsl:template name="page-master-a4">
    <fo:simple-page-master master-name="A4" 
      page-height="29.7cm" 
      page-width="21cm" 
      margin-top="1.5cm" 
      margin-bottom="1.5cm" 
      margin-left="2cm" 
      margin-right="2cm">
      <fo:region-body margin-top="1cm" margin-bottom="1.5cm"/>
      <fo:region-before extent="1cm"/>
      <fo:region-after extent="1cm"/>
    </fo:simple-page-master>
  </xsl:template>

  <!-- Header template -->
  <xsl:template name="page-header">
    <xsl:param name="title"/>
    <fo:static-content flow-name="xsl-region-before">
      <fo:block text-align="right" font-size="9pt" color="#666666">
        <xsl:value-of select="$title"/>
      </fo:block>
    </fo:static-content>
  </xsl:template>

  <!-- Footer template -->
  <xsl:template name="page-footer">
    <fo:static-content flow-name="xsl-region-after">
      <fo:block text-align="center" font-size="9pt" color="#666666" 
                border-top="1pt solid #cccccc" padding-top="5pt">
        Page <fo:page-number/> of <fo:page-number-citation ref-id="last-page"/>
      </fo:block>
    </fo:static-content>
  </xsl:template>

</xsl:stylesheet>
